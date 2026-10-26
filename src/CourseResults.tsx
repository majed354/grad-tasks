import { useState } from "react";
import type { Student } from "./model";
import { Badge, number, formatDate } from "./ui";
import {
  gradeCode,
  gradeDescription,
  resultConflict,
  resultGrades,
} from "./results";

export function CourseResults({
  student: s,
  print = false,
}: {
  student: Student;
  print?: boolean;
}) {
  const periods = [...new Set(s.courseResults.map((r) => r.period))]
    .sort()
    .reverse();
  const [period, setPeriod] = useState("");
  const rows = s.courseResults
    .filter((r) => print || !period || r.period === period)
    .slice()
    .sort(
      (a, b) =>
        b.period.localeCompare(a.period) || a.code.localeCompare(b.code),
    );
  return (
    <section className="historical-results">
      <div className="section-line">
        <h3>
          نتائج المقررات التاريخية{" "}
          <span className="heading-count">
            {number(s.courseResults.length)}
          </span>
        </h3>
        {!print && periods.length > 0 && (
          <label>
            الفصل{" "}
            <select
              aria-label="فصل نتائج المقررات"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="">كل الفصول المرفقة</option>
              {periods.map((p) => (
                <option key={p} value={p}>
                  {p} · {`14${p.slice(0, 2)}`}هـ
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="field-note">
        ع: منقطع في المقرر، ح: محروم في المقرر، هـ: راسب في المقرر. هذه نتائج في
        فصولها الأصلية؛ حالة القيد تؤخذ من كشف السنة والفصل المحددين أعلاه.
        التقدير الفارغ في نسخة مصدر لا يمحو تقديرًا مثبتًا.
      </p>
      {!rows.length ? (
        <p className="muted">لا نتائج مقررات موثقة مرفقة لهذا الملف.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الفصل</th>
                <th>المقرر</th>
                <th>النتيجة في مصادرها</th>
                <th>الشعبة / النشاط</th>
                <th>الشواهد</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const content = (
                  <div className="result-evidence">
                    {r.observations.map((o, i) => (
                      <div key={i} className="result-observation">
                        <strong>{gradeDescription(o.gradeRaw)}</strong>
                        <span>
                          {" "}
                          · الرمز الخام: {o.gradeRaw || "فارغ"} · المجموع:{" "}
                          {o.totalRaw || "غير مسجل"} · استخراج:{" "}
                          {o.sourceDate ? formatDate(o.sourceDate) : "غير موثق"}
                        </span>
                        {o.titleRaw && o.titleRaw !== r.title && (
                          <small>
                            عنوان المقرر في هذه النسخة: {o.titleRaw}
                          </small>
                        )}
                        {o.references.map((ref) => {
                          const e = s.evidence.find(
                            (e) => e.id === ref.evidenceId,
                          )!;
                          return (
                            <div
                              key={ref.evidenceId + ref.locator}
                              className="result-reference"
                            >
                              <span>
                                {e.sourceName || e.kind} ·{" "}
                                <bdi>{ref.locator}</bdi>
                              </span>
                              {e.url && (
                                <a
                                  href={e.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  فتح المصدر
                                </a>
                              )}
                              {e.sourcePath && (
                                <>
                                  <code className="source-path">
                                    {e.sourcePath}
                                  </code>
                                  {!print && (
                                    <button
                                      className="text-button"
                                      onClick={() =>
                                        navigator.clipboard?.writeText(
                                          e.sourcePath,
                                        )
                                      }
                                    >
                                      نسخ مسار الملف
                                    </button>
                                  )}
                                </>
                              )}
                              {print && <small>{e.notes}</small>}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
                return (
                  <tr key={r.id}>
                    <td>
                      <bdi>{r.period}</bdi>
                      <small>{`14${r.period.slice(0, 2)}`}هـ</small>
                    </td>
                    <td>
                      <strong>{r.title}</strong>
                      <small>
                        <bdi>{r.code}</bdi>
                      </small>
                    </td>
                    <td>
                      {resultGrades(r).length
                        ? resultGrades(r).map((g) => (
                            <Badge
                              key={g}
                              tone={
                                ["ع", "ح", "ه"].includes(g)
                                  ? "amber"
                                  : "neutral"
                              }
                            >
                              {gradeDescription(
                                r.observations.find(
                                  (o) => gradeCode(o.gradeRaw) === g,
                                )?.gradeRaw || g,
                              )}
                            </Badge>
                          ))
                        : "لم يرصد تقدير رمزي"}
                      {resultConflict(r) && (
                        <small className="result-conflict">
                          اختلاف تقديرات · يحتاج مراجعة
                        </small>
                      )}
                    </td>
                    <td>
                      {r.section || "—"}
                      <small>{r.activity || "—"}</small>
                    </td>
                    <td>
                      {print ? (
                        content
                      ) : (
                        <details>
                          <summary>
                            عرض الشواهد (
                            {number(
                              r.observations.reduce(
                                (n, o) => n + o.references.length,
                                0,
                              ),
                            )}
                            )
                          </summary>
                          {content}
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
