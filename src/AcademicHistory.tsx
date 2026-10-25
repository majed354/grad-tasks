import type { Student } from "./model";
import { formatGpa } from "./model";
import { semesterName } from "./academic";
import { formatDate } from "./ui";
export function AcademicHistory({ student: s }: { student: Student }) {
  if (!s.academicSnapshots.length)
    return (
      <p className="field-note">
        لا يوجد رصد تفصيلي بحسب الفصل في هذا الملف. آخر سنة رصد وحدها لا تكفي
        لإحصاء السنة.
      </p>
    );
  return (
    <section className="academic-history">
      <h3>الرصد بحسب السنوات والفصول</h3>
      <p className="field-note">
        كل صف حالة مسجلة في كشفه. تاريخ الاستخراج مستقل عن الفصل والقبول؛ غياب
        الطالب عن كشف لاحق لا يثبت تخرجه.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>السنة / الفصل</th>
              <th>تاريخ الاستخراج</th>
              <th>الحالة المصدرية</th>
              <th>المعدل</th>
              <th>المصدر</th>
            </tr>
          </thead>
          <tbody>
            {[...s.academicSnapshots]
              .sort(
                (a, b) =>
                  b.period.localeCompare(a.period) ||
                  b.sourceDate.localeCompare(a.sourceDate),
              )
              .map((x) => (
                <tr key={x.id}>
                  <td>
                    {x.academicYear}هـ
                    <small>
                      {semesterName(x.period)} · {x.period}
                    </small>
                  </td>
                  <td>{formatDate(x.sourceDate)}</td>
                  <td>{x.status}</td>
                  <td>{formatGpa(x)}</td>
                  <td>
                    {x.evidenceIds
                      .map((id) => s.evidence.find((e) => e.id === id))
                      .filter((e) => !!e)
                      .map((e) => (
                        <div key={e.id}>
                          {e.url ? (
                            <a
                              className="text-link"
                              href={e.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {e.sourceName || e.kind} · {e.locator}
                            </a>
                          ) : (
                            <span>
                              {e.sourceName || e.kind} · {e.locator}
                            </span>
                          )}
                        </div>
                      ))}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
