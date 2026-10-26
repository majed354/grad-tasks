import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Printer,
  Upload,
  Trash2,
} from "lucide-react";
import type { Student } from "./model";
import { statuses, stages } from "./catalog";
import { Badge, Empty, SearchBox, formatDate, number } from "./ui";
import {
  expectedLevel,
  filterDirectory,
  LEVEL_METHOD,
  levelLabel,
  progressGroup,
  progressGroups,
  statusLabel,
  statusTone,
} from "./progress";
export type DirectoryMemory = {
  query?: string;
  group?: string;
  status?: string;
  stage?: string;
  level?: string;
  failed?: boolean;
  sort?: string;
};

export function StatusBreakdown({
  students,
  active = "",
  onSelect,
  available = true,
}: {
  students: Student[];
  active?: string;
  onSelect: (id: string) => void;
  available?: boolean;
}) {
  return (
    <div className="status-breakdown" aria-label="حالات الطلاب في النطاق">
      {[{ id: "", label: "الكل", tone: "neutral" }, ...progressGroups].map(
        (g) => {
          const count = g.id
            ? students.filter((s) => progressGroup(s) === g.id).length
            : students.length;
          return (
            <button
              key={g.id}
              className={`status-tile ${g.tone} ${active === g.id ? "active" : ""}`}
              aria-pressed={active === g.id}
              onClick={() => onSelect(g.id)}
            >
              <span>{g.label}</span>
              <strong>{available ? number(count) : "—"}</strong>
            </button>
          );
        },
      )}
    </div>
  );
}

export default function StudentDirectory({
  students,
  available,
  hasWorkspaceData,
  memory,
  onOpen,
  onExport,
  onPrint,
  onImport,
  onAdd,
  onDelete,
}: {
  students: Student[];
  available: boolean;
  hasWorkspaceData: boolean;
  memory: { current: DirectoryMemory };
  onOpen: (id: string) => void;
  onExport: (s: Student[]) => void;
  onPrint: (s: Student[]) => void;
  onImport: () => void;
  onAdd: () => void;
  onDelete: (s: Student) => void;
}) {
  const [query, setQuery] = useState(memory.current.query || "");
  const [group, setGroup] = useState(memory.current.group || "");
  const [status, setStatus] = useState(memory.current.status || "");
  const [stage, setStage] = useState(memory.current.stage || "");
  const [level, setLevel] = useState(memory.current.level || "");
  const [failed, setFailed] = useState(memory.current.failed || false);
  const [sort, setSort] = useState(memory.current.sort || "name");
  useEffect(() => {
    memory.current = { query, group, status, stage, level, failed, sort };
  }, [memory, query, group, status, stage, level, failed, sort]);
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filtered = useMemo(
    () =>
      filterDirectory(students, {
        query,
        group,
        status,
        stage,
        level,
        failed,
      }).sort((a, b) =>
        sort === "number"
          ? a.studentNumber.localeCompare(b.studentNumber)
          : sort === "level"
            ? (expectedLevel(a)?.value || 0) - (expectedLevel(b)?.value || 0)
            : a.fullName.localeCompare(b.fullName, "ar"),
      ),
    [students, query, group, status, stage, level, failed, sort],
  );
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [students, query, group, status, stage, level, failed, sort, pageSize]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageNow = Math.min(page, pageCount);
  const chosen = filtered.filter((s) => selected.has(s.id));
  const output = chosen.length ? chosen : filtered;
  const levels = [
    ...new Set(
      students
        .map((s) => expectedLevel(s)?.value)
        .filter((x): x is number => x !== undefined),
    ),
  ].sort((a, b) => a - b);
  const clear = () => {
    setQuery("");
    setGroup("");
    setStatus("");
    setStage("");
    setLevel("");
    setFailed(false);
  };
  return (
    <>
      <div className="directory-heading">
        <h1>
          الطلاب والحالات{" "}
          <span className="heading-count">
            {available ? number(students.length) : "—"}
          </span>
        </h1>
        <div className="button-row">
          <button className="button small" onClick={onImport}>
            <Upload size={15} />
            استيراد
          </button>
          <button className="button small" onClick={onAdd}>
            <Plus size={15} />
            إضافة طالب
          </button>
        </div>
      </div>
      <StatusBreakdown
        students={students}
        available={available}
        active={group}
        onSelect={(id) => {
          setGroup(id);
          setStatus("");
        }}
      />
      <section className="panel directory-panel">
        <div className="directory-tools">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="ابحث باسم الطالب أو رقمه أو المشرف أو الرسالة…"
          />
          <button
            className="button"
            disabled={!output.length}
            onClick={() => onExport(output)}
          >
            <Download size={16} />
            {chosen.length
              ? `تصدير المحدد (${number(chosen.length)})`
              : "تصدير النتائج"}
          </button>
          <button
            className="button"
            disabled={!output.length}
            onClick={() => onPrint(output)}
          >
            <Printer size={16} />
            طباعة
          </button>
        </div>
        <div className="directory-filter-row">
          <label>
            حالة القيد
            <select
              aria-label="تصفية حالة القيد"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setGroup("");
              }}
            >
              <option value="">جميع الحالات</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            المستوى الزمني المتوقع
            <select
              aria-label="تصفية المستوى المتوقع"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option value="">كل المستويات</option>
              {levels.map((x) => (
                <option key={x} value={x}>
                  المستوى {number(x)} · تقديري
                </option>
              ))}
            </select>
          </label>
          <label>
            ترتيب الطلاب
            <select
              aria-label="ترتيب الطلاب"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="name">الاسم أبجديًا</option>
              <option value="number">الرقم الجامعي</option>
              <option value="level">المستوى الزمني المتوقع</option>
            </select>
          </label>
          {(query || group || status || stage || level || failed) && (
            <button className="text-button" onClick={clear}>
              مسح فلاتر القائمة
            </button>
          )}
          <details className="advanced-filters">
            <summary>تفاصيل إضافية</summary>
            <div>
              <label>
                مرحلة الرسالة المسجلة
                <select
                  aria-label="تصفية المرحلة"
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                >
                  <option value="">جميع المراحل</option>
                  {stages.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={failed}
                  onChange={(e) => setFailed(e.target.checked)}
                />
                لديهم مقرر غير مجتاز في السجل المرفق
              </label>
              <p>
                الرسوب يحتاج كشف نتائج؛ لا يستنتج من المعدل أو مدة الدراسة.{" "}
                {students.some((s) => s.courses.length)
                  ? "التصفية تشمل المقررات المرفقة فقط."
                  : "لم ترفق كشوف مقررات لهذا النطاق."}
              </p>
            </div>
          </details>
        </div>
        <details className="estimate-method">
          <summary>كيف حُسب المستوى المتوقع؟</summary>
          <p>{LEVEL_METHOD}</p>
          <p>
            حالة القيد من الكشف المختار. «مستمرون» تشمل المنتظم والمؤجل والمعتذر
            ومؤجل القبول. ملفات الطلاب تعرض مصادر الرسائل والقرارات والتاريخ
            الكامل.
          </p>
        </details>
        <div className="directory-result-line" role="status">
          <span>
            {number(filtered.length)} نتيجة
            {chosen.length ? ` · ${number(chosen.length)} محدد` : ""}
          </span>
          <span>الحالة بحسب فصل الرصد المحدد</span>
        </div>
        {filtered.length ? (
          <>
            <div className="table-wrap directory-table-wrap">
              <table className="student-table quick-students">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="تحديد كل نتائج البحث"
                        checked={filtered.every((s) => selected.has(s.id))}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? new Set(filtered.map((s) => s.id))
                              : new Set(),
                          )
                        }
                      />
                    </th>
                    <th>الطالب</th>
                    <th>حالة القيد</th>
                    <th>البرنامج / الدرجة</th>
                    <th>المستوى المتوقع زمنيًا</th>
                    <th>تاريخ القبول</th>
                    <th>الملف</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered
                    .slice((pageNow - 1) * pageSize, pageNow * pageSize)
                    .map((s) => (
                      <tr
                        key={s.id}
                        className={selected.has(s.id) ? "selected" : ""}
                      >
                        <td className="row-select">
                          <input
                            type="checkbox"
                            aria-label={`تحديد ${s.fullName}`}
                            checked={selected.has(s.id)}
                            onChange={(e) =>
                              setSelected((v) => {
                                const n = new Set(v);
                                e.target.checked ? n.add(s.id) : n.delete(s.id);
                                return n;
                              })
                            }
                          />
                        </td>
                        <td className="row-student">
                          <button
                            className="student-name"
                            onClick={() => onOpen(s.id)}
                          >
                            <span>
                              <strong>{s.fullName}</strong>
                              <small>
                                <bdi>{s.studentNumber}</bdi>
                              </small>
                            </span>
                          </button>
                        </td>
                        <td className="row-status" data-label="حالة القيد">
                          <Badge tone={statusTone(s)}>{statusLabel(s)}</Badge>
                          <small>
                            رصد {s.asOfAcademicYear || "غير مؤرخ"}
                            {s.asOfPeriod ? ` · ${s.asOfPeriod}` : ""}
                          </small>
                        </td>
                        <td data-label="البرنامج">
                          <strong>{s.program}</strong>
                          <small>{s.degree}</small>
                        </td>
                        <td data-label="المستوى المتوقع" title={LEVEL_METHOD}>
                          <strong>{levelLabel(s)}</strong>
                          {expectedLevel(s) && (
                            <small>من القبول · لا يثبت الاجتياز</small>
                          )}
                        </td>
                        <td data-label="القبول">
                          {s.admissionDate
                            ? formatDate(s.admissionDate)
                            : "يلزم تاريخ القبول"}
                        </td>
                        <td className="row-actions">
                          <button
                            className="text-button"
                            aria-label={`فتح ملف ${s.fullName}`}
                            onClick={() => onOpen(s.id)}
                          >
                            التفاصيل <ArrowUpLeft size={16} />
                          </button>
                          <button
                            className="icon-button danger"
                            aria-label={`حذف ملف ${s.fullName}`}
                            onClick={() => onDelete(s)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                عرض {number((pageNow - 1) * pageSize + 1)}–
                {number(Math.min(pageNow * pageSize, filtered.length))} من{" "}
                {number(filtered.length)}
              </span>
              <div className="button-row">
                <select
                  aria-label="عدد الطلاب في الصفحة"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                >
                  {[20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {number(n)} لكل صفحة
                    </option>
                  ))}
                </select>
                <button
                  className="icon-button"
                  aria-label="الصفحة السابقة"
                  disabled={pageNow <= 1}
                  onClick={() => setPage(pageNow - 1)}
                >
                  <ChevronRight size={18} />
                </button>
                <span>
                  {number(pageNow)} / {number(pageCount)}
                </span>
                <button
                  className="icon-button"
                  aria-label="الصفحة التالية"
                  disabled={pageNow >= pageCount}
                  onClick={() => setPage(pageNow + 1)}
                >
                  <ChevronLeft size={18} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <Empty
            title={
              !hasWorkspaceData
                ? "لم تُحمّل بيانات الطلاب في هذا المتصفح"
                : !available
                  ? "لا يوجد كشف لهذه السنة أو الفصل"
                  : "لا توجد نتائج مطابقة"
            }
            description={
              !hasWorkspaceData
                ? "افتح نسخة JSON المحفوظة لتحميل الطلاب هنا. كل متصفح له مساحة مستقلة."
                : !available
                  ? "اختر سنة أو فصلًا تتوفر بياناته، أو استورد الكشف."
                  : "يمكنك تغيير الحالة أو المستوى أو مسح فلاتر القائمة."
            }
            action={
              <button
                className="button primary"
                onClick={!hasWorkspaceData || !available ? onImport : clear}
              >
                {!hasWorkspaceData
                  ? "فتح نسخة البيانات"
                  : !available
                    ? "استيراد كشف"
                    : "مسح فلاتر القائمة"}
              </button>
            }
          />
        )}
      </section>
    </>
  );
}

export function ProgramSummary({
  students,
  available,
  onProgram,
}: {
  students: Student[];
  available: boolean;
  onProgram: (program: string, degree: string) => void;
}) {
  const programs = [
    ...new Set(students.map((s) => `${s.program}|${s.degree}`)),
  ].sort((a, b) => a.localeCompare(b, "ar"));
  return (
    <>
      <div className="directory-heading">
        <h1>ملخص البرامج</h1>
        <span>{available ? number(students.length) : "—"} قيدًا في النطاق</span>
      </div>
      <section className="panel status-comparison">
        <h2>توزيع حالات القيد</h2>
        <div
          className="status-composition"
          role="img"
          aria-label="نسب حالات الطلاب"
        >
          {progressGroups.map((g) => {
            const n = students.filter((s) => progressGroup(s) === g.id).length;
            return n ? (
              <span
                key={g.id}
                className={g.id}
                style={{ width: `${(100 * n) / students.length}%` }}
                title={`${g.label}: ${number(n)}`}
              />
            ) : null;
          })}
        </div>
        <div className="status-legend">
          {progressGroups.map((g) => (
            <span key={g.id}>
              <i className={g.id} />
              {g.label}{" "}
              <strong>
                {available
                  ? number(
                      students.filter((s) => progressGroup(s) === g.id).length,
                    )
                  : "—"}
              </strong>
            </span>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>البرامج والدرجات</h2>
          <small>افتح العدد لاستعراض الطلاب</small>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>البرنامج</th>
                <th>الكل</th>
                <th>مستمرون</th>
                <th>خريجون</th>
                <th>منسحبون</th>
                <th>مطوي قيدهم</th>
                <th>مفصولون</th>
                <th>منقطعون</th>
                <th>غير موثق</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((key) => {
                const [program, degree] = key.split("|");
                const rows = students.filter(
                  (s) => s.program === program && s.degree === degree,
                );
                return (
                  <tr key={key}>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => onProgram(program, degree)}
                      >
                        {degree} {program} <ArrowUpLeft size={14} />
                      </button>
                    </td>
                    <td>{number(rows.length)}</td>
                    {progressGroups.map((g) => (
                      <td key={g.id}>
                        {number(
                          rows.filter((s) => progressGroup(s) === g.id).length,
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!programs.length && (
          <p className="muted">لم تتوفر سجلات في النطاق المحدد.</p>
        )}
      </section>
    </>
  );
}
