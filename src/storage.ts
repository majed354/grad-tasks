import { openDB } from "idb";
import { emptyWorkspace, workspaceSchema } from "./model";
import type { Workspace } from "./model";
const db = () =>
  openDB("grad-tasks-local-v1", 1, {
    upgrade(d) {
      d.createObjectStore("workspace");
    },
  });
export async function loadWorkspace(): Promise<Workspace> {
  const d = await db();
  const value = await d.get("workspace", "current");
  return value ? workspaceSchema.parse(value) : emptyWorkspace();
}
export async function saveWorkspace(
  value: Workspace,
  expectedRevision: number,
): Promise<Workspace> {
  const d = await db();
  const tx = d.transaction("workspace", "readwrite");
  const current = await tx.store.get("current");
  if ((current?.revision ?? 0) !== expectedRevision) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("تغيرت البيانات في تبويب آخر. أعد تحميل الصفحة قبل الحفظ.");
  }
  const next = workspaceSchema.parse({
    ...value,
    revision: expectedRevision + 1,
  });
  await tx.store.put(next, "current");
  await tx.done;
  return next;
}
