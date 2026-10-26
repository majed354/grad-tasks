import { workspaceSchema } from "./model";
import type { Workspace, Student } from "./model";

export class RemoteError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api/madar" + path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  let body: { error?: string } & T;
  try {
    body = await response.json();
  } catch {
    throw new RemoteError(
      response.status,
      "تعذر قراءة رد مخزن مدار. أعد المحاولة.",
    );
  }
  if (!response.ok) {
    if (response.status === 401 && path !== "/session")
      window.dispatchEvent(new Event("madar-session-expired"));
    throw new RemoteError(
      response.status,
      body.error || "تعذر الاتصال بمخزن مدار.",
    );
  }
  return body;
}
let loaded: Workspace | null = null;
export function forgetRemoteWorkspace() {
  loaded = null;
}
export async function loadWorkspace(): Promise<Workspace> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let after = "",
      revision: number | null = null;
    const students: Student[] = [];
    let activity: Workspace["activity"] = [];
    let consistent = true;
    do {
      const page = await request<Workspace & { next: string }>(
        "/workspace" + (after ? "?after=" + encodeURIComponent(after) : ""),
      );
      if (revision !== null && revision !== page.revision) {
        consistent = false;
        break;
      }
      if (revision === null) {
        revision = page.revision;
        activity = page.activity;
      }
      students.push(...page.students);
      if (page.next && page.next === after)
        throw new Error("تعذر استكمال قراءة السجل.");
      after = page.next;
    } while (after);
    if (consistent) {
      loaded = workspaceSchema.parse({
        schemaVersion: 1,
        revision: revision ?? 0,
        students,
        activity,
      });
      return loaded;
    }
  }
  throw new Error("تغيرت البيانات أثناء القراءة. أعد تحميل المساحة.");
}
export function buildChunks(upserts: Student[], deletes: string[]) {
  const chunks: { upserts: Student[]; deletes: string[] }[] = [];
  let current = { upserts: [] as Student[], deletes };
  let size = new TextEncoder().encode(JSON.stringify(current)).length;
  for (const student of upserts) {
    const bytes = new TextEncoder().encode(JSON.stringify(student)).length;
    if (bytes > 2100000)
      throw new Error(
        "ملف الطالب أكبر من الحد المسموح للنقل؛ صدّر نسخة وراجع مصادره.",
      );
    if (
      current.upserts.length &&
      (size + bytes > 1800000 || current.upserts.length >= 500)
    ) {
      chunks.push(current);
      current = { upserts: [], deletes: [] };
      size = 32;
    }
    current.upserts.push(student);
    size += bytes + 1;
  }
  if (current.upserts.length || current.deletes.length || !chunks.length)
    chunks.push(current);
  return chunks;
}
export async function saveWorkspace(
  value: Workspace,
  expectedRevision: number,
): Promise<Workspace> {
  if (!loaded || loaded.revision !== expectedRevision)
    throw new Error("حدّث المساحة قبل الحفظ.");
  const checked = workspaceSchema.parse(value);
  const previous = new Map(loaded.students.map((s) => [s.id, s]));
  const ids = new Set(checked.students.map((s) => s.id));
  const upserts = checked.students.filter(
    (s) => JSON.stringify(s) !== JSON.stringify(previous.get(s.id)),
  );
  const deletes = loaded.students
    .filter((s) => !ids.has(s.id))
    .map((s) => s.id);
  const parts = buildChunks(upserts, deletes);
  const id = crypto.randomUUID();
  await request("/changes", {
    method: "POST",
    body: JSON.stringify({
      id,
      expectedRevision,
      chunks: parts.length,
      action: checked.activity[0]?.action || "حفظ بيانات المساحة",
      studentId: checked.activity[0]?.studentId || "",
    }),
  });
  for (let i = 0; i < parts.length; i++)
    await request(`/changes/${id}/${i}`, {
      method: "PUT",
      body: JSON.stringify(parts[i]),
    });
  let result: { revision: number };
  try {
    result = await request<{ revision: number }>(`/changes/${id}/commit`, {
      method: "POST",
      body: "{}",
    });
  } catch (e) {
    if (e instanceof RemoteError && e.status < 500) throw e;
    try {
      result = await request<{ revision: number }>(`/changes/${id}/commit`, {
        method: "POST",
        body: "{}",
      });
    } catch {
      throw new Error(
        "تعذر تأكيد نتيجة الحفظ. حدّث المساحة للتحقق من وصول التغييرات قبل المحاولة مرة أخرى.",
      );
    }
  }
  loaded = { ...checked, revision: result.revision };
  return loaded;
}
