// Read-only verification after an authorized transfer. Credentials only from env.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createServer } from "vite";

const [base, referenceFile, outputDirectory] = process.argv.slice(2);
if (
  !base ||
  !referenceFile ||
  !outputDirectory ||
  !process.env.MADAR_ACCESS_CODE
)
  throw new Error(
    "Usage: verify_shared.mjs URL reference.json ignored-output-directory; set MADAR_ACCESS_CODE.",
  );
const target = new URL(base).origin;
const vite = await createServer({ server: { middlewareMode: true } });
const { workspaceSchema } = await vite.ssrLoadModule("/src/model.ts");
const cookies = [];
async function call(route, method = "GET", body, cookie = "") {
  const response = await fetch(target + "/api/madar" + route, {
    method,
    headers: {
      Origin: target,
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await response.json() };
}
async function login(code) {
  const { response } = await call("/session", "POST", { code });
  if (!response.ok)
    throw new Error("Verification login status " + response.status);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("No session cookie");
  cookies.push(cookie);
  return cookie;
}
async function read(cookie) {
  let after = "",
    revision,
    activity = [],
    students = [];
  do {
    const { response, body } = await call(
      "/workspace" + (after ? "?after=" + encodeURIComponent(after) : ""),
      "GET",
      undefined,
      cookie,
    );
    if (!response.ok)
      throw new Error("Workspace read status " + response.status);
    if (revision !== undefined && revision !== body.revision)
      throw new Error("Changed during verification");
    if (revision === undefined) {
      revision = body.revision;
      activity = body.activity;
    }
    students.push(...body.students);
    after = body.next;
  } while (after);
  return workspaceSchema.parse({
    schemaVersion: 1,
    revision,
    students,
    activity,
  });
}
try {
  const denied = await call("/workspace");
  if (
    denied.response.status !== 401 ||
    Object.keys(denied.body).some((k) => k !== "error")
  )
    throw new Error("Anonymous access was not denied");
  const one = await login(process.env.MADAR_ACCESS_CODE);
  const two = await login(
    process.env.MADAR_ACCESS_CODE.replace(
      /\d/g,
      (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)],
    ),
  );
  const first = await read(one),
    second = await read(two);
  if (!isDeepStrictEqual(first, second))
    throw new Error("Independent sessions differ");
  const ref = workspaceSchema.parse(
    JSON.parse(await fs.readFile(referenceFile, "utf8")),
  );
  const sort = (s) => [...s].sort((a, b) => a.id.localeCompare(b.id));
  if (!isDeepStrictEqual(sort(ref.students), sort(first.students)))
    throw new Error("Source records differ");
  await fs.mkdir(outputDirectory, { recursive: true });
  const backup =
    JSON.stringify(
      {
        format: "grad-tasks-backup",
        exportedAt: new Date().toISOString(),
        ...first,
      },
      null,
      2,
    ) + "\n";
  await fs.writeFile(
    path.join(outputDirectory, "backup-from-server.grad.json"),
    backup,
  );
  const result = {
    valid: true,
    target,
    verifiedAt: new Date().toISOString(),
    revision: first.revision,
    students: first.students.length,
    courseResults: first.students.reduce(
      (n, s) => n + s.courseResults.length,
      0,
    ),
    references: first.students.reduce(
      (n, s) =>
        n +
        s.courseResults.reduce(
          (a, r) =>
            a + r.observations.reduce((b, o) => b + o.references.length, 0),
          0,
        ),
      0,
    ),
    independentSessionsEqual: true,
    arabicCodeAccepted: true,
    allStudentFieldsMatch: true,
    anonymousStatus: denied.response.status,
    backupBytes: Buffer.byteLength(backup),
    backupSHA256: createHash("sha256").update(backup).digest("hex"),
  };
  await fs.writeFile(
    path.join(outputDirectory, "server-verification.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  for (const cookie of cookies)
    await call("/session", "DELETE", undefined, cookie).catch(() => {});
  await vite.close();
}
