import { afterAll, beforeAll, expect, test } from "vitest";
import { NetlifyDB } from "@netlify/database-dev";
import { Pool } from "pg";
import { randomUUID, scryptSync } from "node:crypto";
import {
  ApiError,
  COOKIE,
  sessionCookie,
  WorkspaceService,
} from "../server/workspace";
import { newStudent } from "../src/model";
import { createHandler } from "../server/http";

let db: NetlifyDB, pool: Pool, service: WorkspaceService;
let cookie = "",
  secondCookie = "";
const salt = "a".repeat(32),
  secret = "synthetic-test-code-123";
const hash = `scrypt$${salt}$${scryptSync(secret, salt, 32).toString("hex")}`;
function req(
  path: string,
  method = "GET",
  body?: unknown,
  auth = cookie,
  origin = "https://madar.example",
) {
  return new Request("https://madar.example" + path, {
    method,
    headers: { origin, cookie: auth, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function student(number: string) {
  return {
    ...newStudent(),
    studentNumber: number,
    fullName: "طالب افتراضي للاختبار",
    program: "برنامج افتراضي",
  };
}
beforeAll(async () => {
  db = new NetlifyDB({ logger: () => {} });
  const connectionString = await db.start();
  await db.applyMigrations("netlify/database/migrations");
  pool = new Pool({ connectionString, max: 2 });
  service = new WorkspaceService(pool, hash);
  cookie = `${COOKIE}=${await service.login(req("/session", "POST", { code: secret }, ""), "test-device-1")}`;
  secondCookie = `${COOKIE}=${await service.login(req("/session", "POST", { code: secret }, ""), "test-device-2")}`;
}, 30000);
afterAll(async () => {
  await pool?.end();
  await db?.stop();
});
async function begin(expectedRevision: number, chunks = 1) {
  const id = randomUUID();
  await service.begin(
    req("/changes", "POST", {
      id,
      expectedRevision,
      chunks,
      action: "تحديث اختباري",
      studentId: "",
    }),
  );
  return id;
}
test("server rejects anonymous access, wrong origin and expired sessions", async () => {
  await expect(
    service.page(req("/workspace", "GET", undefined, "")),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    service.begin(req("/changes", "POST", {}, "")),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    service.login(
      req("/session", "POST", { code: secret }, "", "https://foreign.example"),
      "csrf-test",
    ),
  ).rejects.toMatchObject({ status: 403 });
  const token = await service.login(
    req("/session", "POST", { code: secret }, ""),
    "expired-test",
  );
  await service.logout(
    req("/session", "DELETE", undefined, `${COOKIE}=${token}`),
  );
  await expect(
    service.session(req("/workspace", "GET", undefined, `${COOKIE}=${token}`)),
  ).rejects.toMatchObject({ status: 401 });
  expect(sessionCookie(token)).toContain("HttpOnly; Secure; SameSite=Strict");
  expect(sessionCookie(token)).toContain("Max-Age=28800");
});
test("shared code has a persistent limit on failed logins", async () => {
  for (let i = 0; i < 6; i++)
    await expect(
      service.login(
        req("/session", "POST", { code: "wrong" }, ""),
        "rate-test",
      ),
    ).rejects.toMatchObject({ status: 401 });
  await expect(
    service.login(req("/session", "POST", { code: secret }, ""), "rate-test"),
  ).rejects.toMatchObject({ status: 429 });
});
test("access code accepts Arabic and English digits with the same session rights", async () => {
  const token = await service.login(
    req("/session", "POST", { code: "synthetic-test-code-١٢٣" }, ""),
    "arabic-digit-test",
  );
  expect(
    await service.session(
      req("/workspace", "GET", undefined, `${COOKIE}=${token}`),
    ),
  ).toBeTruthy();
  await expect(
    service.login(
      req("/session", "POST", { code: "synthetic-test-code-124" }, ""),
      "arabic-wrong-digit-test",
    ),
  ).rejects.toMatchObject({ status: 401 });
});
test("staged import is atomic, shared across sessions and commit is idempotent", async () => {
  const id = await begin(0, 2),
    a = student("90000001"),
    b = student("90000002");
  await service.putChunk(
    req("/part", "PUT", { upserts: [a], deletes: [] }),
    id,
    0,
  );
  await expect(
    service.commit(req("/commit", "POST", {}), id),
  ).rejects.toMatchObject({ status: 409 });
  expect((await service.page(req("/workspace"))).students).toHaveLength(0);
  await service.putChunk(
    req("/part", "PUT", { upserts: [b], deletes: [] }),
    id,
    1,
  );
  expect(await service.commit(req("/commit", "POST", {}), id)).toEqual({
    revision: 1,
  });
  expect(await service.commit(req("/commit", "POST", {}), id)).toEqual({
    revision: 1,
  });
  const other = await service.page(
    req("/workspace", "GET", undefined, secondCookie),
  );
  expect(other.students).toHaveLength(2);
  expect(other.students.find((s) => s.id === a.id)).toEqual(a);
  expect(other.activity).toHaveLength(1);
});
test("concurrent devices cannot overwrite a newer revision", async () => {
  const a = await begin(1),
    b = await begin(1);
  await service.putChunk(
    req("/part", "PUT", { upserts: [], deletes: [] }),
    a,
    0,
  );
  await service.putChunk(
    req("/part", "PUT", { upserts: [], deletes: [] }),
    b,
    0,
  );
  await service.commit(req("/commit", "POST", {}), a);
  await expect(
    service.commit(req("/commit", "POST", {}), b),
  ).rejects.toMatchObject({ status: 409 });
  expect((await service.page(req("/workspace"))).revision).toBe(2);
});
test("identity collisions roll back and updates preserve archived versions", async () => {
  const w = await service.page(req("/workspace"));
  const original = w.students[0];
  const bad = await begin(2);
  await service.putChunk(
    req("/part", "PUT", {
      upserts: [{ ...original, id: randomUUID() }],
      deletes: [],
    }),
    bad,
    0,
  );
  await expect(
    service.commit(req("/commit", "POST", {}), bad),
  ).rejects.toBeInstanceOf(ApiError);
  expect((await service.page(req("/workspace"))).revision).toBe(2);
  const update = await begin(2);
  await service.putChunk(
    req("/part", "PUT", {
      upserts: [{ ...original, notes: "تعديل تجريبي" }],
      deletes: [],
    }),
    update,
    0,
  );
  await expect(
    service.putChunk(
      req("/part", "PUT", { upserts: [], deletes: [] }),
      update,
      0,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await service.commit(req("/commit", "POST", {}), update);
  const archived = (
    await pool.query(
      "SELECT data FROM madar_student_versions WHERE student_id=$1",
      [original.id],
    )
  ).rows;
  expect(archived[0].data).toEqual(original);
  const removal = await begin(3);
  await service.putChunk(
    req("/part", "PUT", { upserts: [], deletes: [original.id] }),
    removal,
    0,
  );
  await service.commit(req("/commit", "POST", {}), removal);
  expect((await service.page(req("/workspace"))).students).toHaveLength(1);
  expect(
    (
      await pool.query(
        "SELECT data,deleted_at FROM madar_students WHERE id=$1",
        [original.id],
      )
    ).rows[0].deleted_at,
  ).toBeTruthy();
});
test("change ownership is bound to its own authenticated session", async () => {
  const id = await begin(4);
  await expect(
    service.putChunk(
      req("/part", "PUT", { upserts: [], deletes: [] }, secondCookie),
      id,
      0,
    ),
  ).rejects.toMatchObject({ status: 409 });
});
test("HTTP responses deny access without data and never cache private responses", async () => {
  const handler = createHandler(() => service);
  const denied = await handler(
    req("/api/madar/workspace", "GET", undefined, ""),
    "http-test",
  );
  expect(denied.status).toBe(401);
  expect(denied.headers.get("Cache-Control")).toContain("no-store");
  expect(await denied.json()).toEqual({ error: "سجّل الدخول إلى مدار." });
  expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
  const csrf = await handler(
    req("/api/madar/changes", "POST", {}, cookie, "https://foreign.example"),
    "http-test",
  );
  expect(csrf.status).toBe(403);
});
test("paginated reads preserve complete legacy identifiers without duplicates", async () => {
  const id = await begin(4);
  const additions = Array.from({ length: 53 }, (_, i) => ({
    ...student("910000" + i),
    id: `legacy-${String(i).padStart(3, "0")}`,
  }));
  await service.putChunk(
    req("/part", "PUT", { upserts: additions, deletes: [] }),
    id,
    0,
  );
  await service.commit(req("/commit", "POST", {}), id);
  const first = await service.page(req("/workspace"));
  expect(first.students).toHaveLength(50);
  const second = await service.page(req("/workspace?after=" + first.next));
  expect(second.students).toHaveLength(4);
  expect(second.next).toBe("");
  expect(
    new Set([...first.students, ...second.students].map((s) => s.id)).size,
  ).toBe(54);
});
