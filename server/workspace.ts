import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import {
  digits,
  emptyWorkspace,
  studentKey,
  studentSchema,
  workspaceSchema,
} from "../src/model";
import type { Student } from "../src/model";

export const COOKIE = "__Host-madar_session";
// Netlify's Node and serverless drivers expose this common pg transaction interface.
interface SqlConnection {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, any>[] }>;
  release(): void;
}
interface SqlPool {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, any>[] }>;
  connect(): Promise<SqlConnection>;
}
const SESSION_HOURS = 8;
const uuid = z.string().uuid();
const chunkSchema = z.object({
  upserts: z.array(studentSchema).max(500),
  deletes: z.array(z.string().min(1)).max(20000),
});
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export function passwordMatches(code: string, encoded: string) {
  const [kind, salt, hash] = encoded.split("$");
  if (
    kind !== "scrypt" ||
    !/^[a-f0-9]{32}$/.test(salt ?? "") ||
    !/^[a-f0-9]{64}$/.test(hash ?? "")
  )
    return false;
  return timingSafeEqual(scryptSync(code, salt, 32), Buffer.from(hash, "hex"));
}
export function verifyOrigin(req: Request) {
  if (
    req.headers.get("origin") !== new URL(req.url).origin ||
    req.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new ApiError(
      403,
      "تعذر التحقق من مصدر الطلب. افتح مدار مباشرة وأعد المحاولة.",
    );
}
export function cookieValue(req: Request) {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(COOKIE + "="))
      ?.slice(COOKIE.length + 1) ?? ""
  );
}
export const sessionCookie = (value: string, maxAge = SESSION_HOURS * 3600) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

export class WorkspaceService {
  constructor(
    private pool: SqlPool,
    private accessHash: string,
  ) {}
  async session(req: Request) {
    if (!this.accessHash) throw new ApiError(503, "خدمة الدخول لم تهيأ بعد.");
    const token = cookieValue(req);
    if (!/^[\w-]{43}$/.test(token))
      throw new ApiError(401, "سجّل الدخول إلى مدار.");
    const key = digest(token);
    const { rows } = await this.pool.query(
      "SELECT digest FROM madar_sessions WHERE digest=$1 AND key_version=$2 AND expires_at>now()",
      [key, digest(this.accessHash)],
    );
    if (!rows.length)
      throw new ApiError(401, "انتهت الجلسة. سجّل الدخول مرة أخرى.");
    return key;
  }
  async login(req: Request, ip: string) {
    verifyOrigin(req);
    if (!this.accessHash) throw new ApiError(503, "خدمة الدخول لم تهيأ بعد.");
    const input = z
      .object({ code: z.string().min(1).max(128) })
      .parse(await req.json());
    const window = Math.floor(Date.now() / 900000);
    const bucket = digest(ip + ":" + digest(this.accessHash)) + ":" + window;
    const { rows } = await this.pool.query(
      "INSERT INTO madar_login_attempts(bucket,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(bucket) DO UPDATE SET attempts=madar_login_attempts.attempts+1 RETURNING attempts",
      [bucket],
    );
    if (rows[0].attempts > 6)
      throw new ApiError(429, "تكررت محاولات الدخول. حاول بعد ١٥ دقيقة.");
    if (!passwordMatches(digits(input.code), this.accessHash))
      throw new ApiError(401, "رمز الدخول غير صحيح.");
    const token = randomBytes(32).toString("base64url");
    await this.pool.query(
      "INSERT INTO madar_sessions(digest,key_version,expires_at) VALUES($1,$2,now()+interval '8 hours')",
      [digest(token), digest(this.accessHash)],
    );
    return token;
  }
  async logout(req: Request) {
    verifyOrigin(req);
    await this.pool.query("DELETE FROM madar_sessions WHERE digest=$1", [
      digest(cookieValue(req)),
    ]);
  }
  async page(req: Request) {
    await this.session(req);
    const after = new URL(req.url).searchParams.get("after") ?? "";
    z.string().max(10000).parse(after);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const revision = (
        await client.query("SELECT revision FROM madar_workspace WHERE id=1")
      ).rows[0].revision;
      const rows = (
        await client.query(
          "SELECT id,data FROM madar_students WHERE deleted_at IS NULL AND ($1='' OR id > $1) ORDER BY id LIMIT 51",
          [after],
        )
      ).rows;
      const students: Student[] = [];
      let bytes = 0;
      for (const row of rows.slice(0, 50)) {
        const size = Buffer.byteLength(JSON.stringify(row.data));
        if (students.length && bytes + size > 1800000) break;
        students.push(row.data);
        bytes += size;
      }
      const activity = after
        ? []
        : (
            await client.query(
              "SELECT id,at,action,student_id FROM madar_audit ORDER BY revision DESC LIMIT 200",
            )
          ).rows.map((r) => ({
            id: r.id,
            at: new Date(r.at).toISOString(),
            action: r.action,
            studentId: r.student_id,
          }));
      await client.query("COMMIT");
      return {
        ...emptyWorkspace(),
        revision,
        students,
        activity,
        next: students.length < rows.length ? (students.at(-1)?.id ?? "") : "",
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async begin(req: Request) {
    verifyOrigin(req);
    const owner = await this.session(req);
    const input = z
      .object({
        id: uuid,
        expectedRevision: z.number().int().nonnegative(),
        chunks: z.number().int().min(1).max(500),
        action: z.string().min(1).max(1000),
        studentId: z.string().max(100),
      })
      .parse(await req.json());
    const revision = (
      await this.pool.query("SELECT revision FROM madar_workspace WHERE id=1")
    ).rows[0].revision;
    if (revision !== input.expectedRevision)
      throw new ApiError(
        409,
        "تغيرت البيانات من جهاز آخر. حدّث المساحة قبل الحفظ.",
      );
    await this.pool.query(
      "INSERT INTO madar_changesets(id,owner,expected_revision,total_chunks,action,student_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING",
      [
        input.id,
        owner,
        input.expectedRevision,
        input.chunks,
        input.action,
        input.studentId,
      ],
    );
    const existing = (
      await this.pool.query("SELECT * FROM madar_changesets WHERE id=$1", [
        input.id,
      ])
    ).rows[0];
    if (
      existing.owner !== owner ||
      existing.expected_revision !== input.expectedRevision ||
      existing.total_chunks !== input.chunks ||
      existing.action !== input.action ||
      existing.student_id !== input.studentId
    )
      throw new ApiError(409, "معرف عملية مستخدم لطلب مختلف.");
    return { id: input.id };
  }
  async putChunk(req: Request, id: string, part: number) {
    verifyOrigin(req);
    uuid.parse(id);
    const owner = await this.session(req);
    const operation = (
      await this.pool.query(
        "SELECT * FROM madar_changesets WHERE id=$1 AND owner=$2 AND created_at>now()-interval '1 hour'",
        [id, owner],
      )
    ).rows[0];
    if (!operation || operation.status !== "pending")
      throw new ApiError(409, "عملية الحفظ غير متاحة. أعد المحاولة.");
    if (!Number.isInteger(part) || part < 0 || part >= operation.total_chunks)
      throw new ApiError(400, "جزء غير صالح.");
    const text = await req.text();
    if (Buffer.byteLength(text) > 2200000)
      throw new ApiError(413, "جزء البيانات أكبر من الحد المسموح.");
    const payload = chunkSchema.parse(JSON.parse(text));
    const hash = digest(JSON.stringify(payload));
    await this.pool.query(
      "INSERT INTO madar_chunks(operation_id,part,digest,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(operation_id,part) DO NOTHING",
      [id, part, hash, JSON.stringify(payload)],
    );
    const stored = (
      await this.pool.query(
        "SELECT digest FROM madar_chunks WHERE operation_id=$1 AND part=$2",
        [id, part],
      )
    ).rows[0];
    if (stored.digest !== hash)
      throw new ApiError(409, "محتوى الجزء مختلف عن المحفوظ.");
    return { received: part };
  }
  async commit(req: Request, id: string) {
    verifyOrigin(req);
    uuid.parse(id);
    const owner = await this.session(req);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const currentRevision = (
        await client.query(
          "SELECT revision FROM madar_workspace WHERE id=1 FOR UPDATE",
        )
      ).rows[0].revision;
      const op = (
        await client.query(
          "SELECT * FROM madar_changesets WHERE id=$1 AND owner=$2 FOR UPDATE",
          [id, owner],
        )
      ).rows[0];
      if (!op) throw new ApiError(404, "عملية الحفظ غير موجودة.");
      if (op.status === "committed") {
        await client.query("COMMIT");
        return { revision: op.result_revision };
      }
      if (currentRevision !== op.expected_revision)
        throw new ApiError(
          409,
          "تغيرت البيانات من جهاز آخر. لم تحفظ أي تغييرات؛ حدّث المساحة ثم أعد التعديل.",
        );
      if (Date.now() - new Date(op.created_at).getTime() > 3600000)
        throw new ApiError(409, "انتهت مهلة عملية الحفظ.");
      const parts = (
        await client.query(
          "SELECT payload FROM madar_chunks WHERE operation_id=$1 ORDER BY part",
          [id],
        )
      ).rows;
      if (parts.length !== op.total_chunks)
        throw new ApiError(409, "لم تصل جميع الأجزاء؛ لم تحفظ أي تغييرات.");
      const upserts: Student[] = [],
        deletes: string[] = [];
      for (const part of parts) {
        const p = chunkSchema.parse(part.payload);
        upserts.push(...p.upserts);
        deletes.push(...p.deletes);
      }
      workspaceSchema.parse({ ...emptyWorkspace(), students: upserts });
      const ids = upserts.map((s) => s.id);
      if (
        new Set(deletes).size !== deletes.length ||
        deletes.some((id) => ids.includes(id))
      )
        throw new ApiError(400, "تكرار في هوية عملية الحفظ.");
      const count = Number(
        (
          await client.query(
            "SELECT count(*) AS n FROM madar_students WHERE deleted_at IS NULL AND NOT(id=ANY($1::text[]))",
            [[...ids, ...deletes]],
          )
        ).rows[0].n,
      );
      if (count + upserts.length > 20000)
        throw new ApiError(400, "تجاوز عدد السجلات الحد المسموح.");
      const changed = [...ids, ...deletes];
      const revision = currentRevision + 1;
      await archiveVersions(client, changed);
      if (deletes.length)
        await client.query(
          "UPDATE madar_students SET deleted_at=now(),revision=$2 WHERE id=ANY($1::text[]) AND deleted_at IS NULL",
          [deletes, revision],
        );
      if (upserts.length) {
        const rows = upserts.map((s) => ({
          id: s.id,
          identity_key: studentKey(s),
          data: s,
        }));
        await client.query(
          "INSERT INTO madar_students(id,identity_key,data,revision) SELECT id,identity_key,data,$2 FROM jsonb_to_recordset($1::jsonb) AS x(id text,identity_key text,data jsonb) ON CONFLICT(id) DO UPDATE SET identity_key=excluded.identity_key,data=excluded.data,revision=excluded.revision,deleted_at=NULL",
          [JSON.stringify(rows), revision],
        );
      }
      await client.query("UPDATE madar_workspace SET revision=$1 WHERE id=1", [
        revision,
      ]);
      await client.query(
        "INSERT INTO madar_audit(id,revision,session_digest,action,student_id,changed_ids,deleted_ids) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)",
        [
          randomUUID(),
          revision,
          owner,
          op.action,
          op.student_id,
          JSON.stringify(ids),
          JSON.stringify(deletes),
        ],
      );
      await client.query(
        "UPDATE madar_changesets SET status='committed',result_revision=$2 WHERE id=$1",
        [id, revision],
      );
      await client.query("DELETE FROM madar_chunks WHERE operation_id=$1", [
        id,
      ]);
      await client.query("COMMIT");
      return { revision };
    } catch (e) {
      await client.query("ROLLBACK");
      if ((e as { code?: string }).code === "23505")
        throw new ApiError(
          409,
          "هوية طالب مكررة في البرنامج والدرجة نفسيهما؛ لم تحفظ الدفعة.",
        );
      throw e;
    } finally {
      client.release();
    }
  }
}
async function archiveVersions(client: SqlConnection, ids: string[]) {
  await client.query(
    "INSERT INTO madar_student_versions(student_id,revision,data,deleted_at) SELECT id,revision,data,deleted_at FROM madar_students WHERE id=ANY($1::text[]) ON CONFLICT DO NOTHING",
    [ids],
  );
}
