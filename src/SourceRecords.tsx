import type { Student } from "./model";
import { formatDate } from "./ui";
export function ResearchRecords({ student: s }: { student: Student }) {
  return (
    <>
      {s.researchRecords.map((r) => (
        <article className="record-card" key={r.id}>
          <h3>{r.title}</h3>
          <p className="muted">
            {r.degree} {r.program} · سنة السجل {r.year || "غير مسجلة"} ·{" "}
            {r.verification}
          </p>
          <dl className="details">
            <div>
              <dt>المشرف بحسب المصدر</dt>
              <dd>
                {r.supervisor || "غير مسجل"}
                {r.supervisorId && ` (${r.supervisorId})`}
              </dd>
            </div>
            <div>
              <dt>المشرف المشارك</dt>
              <dd>{r.coSupervisor || "غير مسجل"}</dd>
            </div>
            <div>
              <dt>المناقش الأول</dt>
              <dd>{r.examiner1 || "غير مسجل"}</dd>
            </div>
            <div>
              <dt>المناقش الثاني</dt>
              <dd>{r.examiner2 || "غير مسجل"}</dd>
            </div>
            <div>
              <dt>حالة الرسالة في المصدر</dt>
              <dd>{r.status || "غير مسجلة"}</dd>
            </div>
            <div>
              <dt>تاريخ المناقشة كما ورد</dt>
              <dd>
                {r.defenseDateRaw
                  ? `${r.defenseDateRaw} (${r.defenseCalendar})`
                  : "غير مسجل"}
              </dd>
            </div>
          </dl>
          <small className="field-note">
            حالة الرسالة لا تثبت تخرج الطالب. التاريخ الهجري محفوظ كما ورد دون
            تحويل تلقائي.
          </small>
          <div className="button-row">
            {r.evidenceIds
              .map((id) => s.evidence.find((e) => e.id === id))
              .filter((e) => !!e)
              .map((e) => (
                <a
                  key={e.id}
                  className="text-link"
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {e.kind} · {e.locator}
                </a>
              ))}
          </div>
        </article>
      ))}
    </>
  );
}
export function EvidenceRecords({ student: s }: { student: Student }) {
  return (
    <div className="record-list">
      {s.evidence.map((e) => (
        <article className="record-card" key={e.id}>
          <div className="section-line">
            <h3>{e.kind}</h3>
            <span className="badge">{e.calendar}</span>
          </div>
          <p className="muted">
            موضع الدليل: <bdi>{e.locator}</bdi> · التاريخ الأصلي:{" "}
            <bdi>{e.rawDate || "غير مسجل"}</bdi>
          </p>
          <p className="preserve-text">{e.notes}</p>
          <small className="muted">
            تاريخ الجمع: {formatDate(e.observedAt)}؛ لا يمثل تاريخ تحديث الحالة.
          </small>
          {e.url && (
            <a
              className="text-link source-evidence-link"
              href={e.url}
              target="_blank"
              rel="noreferrer"
            >
              فتح المصدر الأصلي
            </a>
          )}
        </article>
      ))}
    </div>
  );
}
