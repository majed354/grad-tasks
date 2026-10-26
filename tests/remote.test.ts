import { expect, test, vi } from "vitest";
import {
  buildChunks,
  forgetRemoteWorkspace,
  loadWorkspace,
  saveWorkspace,
} from "../src/remote";
import { newStudent } from "../src/model";

test("bulk import chunks respect the API count limit and preserve every related record", () => {
  const students = Array.from({ length: 1100 }, (_, i) => ({
    ...newStudent(),
    studentNumber: String(80000000 + i),
    fullName: "طالب افتراضي",
    program: "الفقه",
    notes: "نص اختبار محفوظ",
  }));
  const deleted = [crypto.randomUUID()];
  const parts = buildChunks(students, deleted);
  expect(parts.every((p) => p.upserts.length <= 500)).toBe(true);
  expect(parts.flatMap((p) => p.upserts)).toEqual(students);
  expect(parts.flatMap((p) => p.deletes)).toEqual(deleted);
});
test("source-rich imports stay within request byte limits", () => {
  const students = Array.from({ length: 50 }, (_, i) => ({
    ...newStudent(),
    studentNumber: String(81000000 + i),
    fullName: "طالب افتراضي",
    program: "الفقه",
    notes: "م".repeat(30000),
  }));
  const parts = buildChunks(students, []);
  expect(parts.length).toBeGreaterThan(1);
  expect(
    parts.every(
      (p) => new TextEncoder().encode(JSON.stringify(p)).length <= 2200000,
    ),
  ).toBe(true);
  expect(parts.flatMap((p) => p.upserts)).toEqual(students);
});
test("an uncertain commit is retried with the same operation identity", async () => {
  const calls: string[] = [];
  let commits = 0;
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    if (url.endsWith("/workspace"))
      return Response.json({
        schemaVersion: 1,
        revision: 0,
        students: [],
        activity: [],
        next: "",
      });
    if (url.endsWith("/commit")) {
      commits++;
      return commits === 1
        ? Response.json({ error: "temporary" }, { status: 503 })
        : Response.json({ revision: 1 });
    }
    return Response.json({});
  });
  try {
    const base = await loadWorkspace();
    const result = await saveWorkspace(
      {
        ...base,
        students: [
          {
            ...newStudent(),
            studentNumber: "82000001",
            fullName: "طالب افتراضي",
            program: "الفقه",
          },
        ],
      },
      0,
    );
    const committed = calls.filter((c) => c.endsWith("/commit"));
    expect(committed).toHaveLength(2);
    expect(committed[0]).toBe(committed[1]);
    expect(result.revision).toBe(1);
  } finally {
    forgetRemoteWorkspace();
    vi.unstubAllGlobals();
  }
});
