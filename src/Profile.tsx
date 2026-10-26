import { useState } from "react";
import {
  ArrowRight,
  Pencil,
  Printer,
  Download,
  Plus,
  ExternalLink,
  Trash2,
  Check,
  Mail,
  Phone,
  BookOpen,
  Calendar,
  FileText,
  MessageSquare,
  CheckSquare,
  GraduationCap,
} from "lucide-react";
import { Badge, Empty, Field, Modal, formatDate, number } from "./ui";
import { missing, overdue, today, validateStudent } from "./model";
import type { Student } from "./model";
import { knownStages } from "./catalog";
import { formatGpa } from "./model";
import { ResearchRecords, EvidenceRecords } from "./SourceRecords";
import { AcademicHistory } from "./AcademicHistory";
import {
  courseResult,
  expectedLevel,
  levelLabel,
  LEVEL_METHOD,
  statusLabel,
  statusTone,
} from "./progress";
type RelatedKey = "tasks" | "courses" | "decisions" | "documents" | "followUps";
type RelatedItem = Student[RelatedKey][number];
type RecordField = {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  required?: boolean;
};
const configs: Record<
  RelatedKey,
  { title: string; fields: RecordField[]; defaults: Record<string, unknown> }
> = {
  tasks: {
    title: "مهمة",
    fields: [
      { key: "title", label: "عنوان المهمة", required: true },
      { key: "dueDate", label: "تاريخ الاستحقاق", type: "date" },
      { key: "owner", label: "المسؤول" },
      { key: "priority", label: "الأولوية", options: ["عادية", "عالية"] },
    ],
    defaults: {
      title: "",
      dueDate: "",
      owner: "",
      priority: "عادية",
      done: false,
    },
  },
  courses: {
    title: "مقرر",
    fields: [
      { key: "code", label: "رمز المقرر" },
      { key: "title", label: "اسم المقرر", required: true },
      { key: "semester", label: "الفصل الدراسي" },
      { key: "credits", label: "الساعات", type: "number" },
      { key: "grade", label: "التقدير المسجل" },
      {
        key: "result",
        label: "حالة المقرر",
        options: ["مسجل", "مجتاز", "غير مجتاز", "معادل"],
      },
    ],
    defaults: {
      code: "",
      title: "",
      semester: "",
      credits: null,
      grade: "",
      result: "مسجل",
    },
  },
  decisions: {
    title: "قرار",
    fields: [
      { key: "title", label: "عنوان القرار", required: true },
      { key: "number", label: "رقم القرار" },
      { key: "date", label: "تاريخ القرار", type: "date" },
      { key: "council", label: "المجلس / الجهة" },
      { key: "page", label: "الصفحة في المصدر" },
      { key: "url", label: "رابط المصدر", type: "url" },
      { key: "notes", label: "ملاحظات", type: "textarea" },
    ],
    defaults: {
      title: "",
      number: "",
      date: "",
      council: "",
      page: "",
      url: "",
      notes: "",
    },
  },
  documents: {
    title: "رابط وثيقة",
    fields: [
      { key: "title", label: "اسم الوثيقة", required: true },
      { key: "type", label: "نوع الوثيقة" },
      { key: "date", label: "تاريخ الوثيقة", type: "date" },
      {
        key: "url",
        label: "رابط الوثيقة (http / https)",
        type: "url",
        required: true,
      },
      { key: "notes", label: "ملاحظات", type: "textarea" },
    ],
    defaults: { title: "", type: "", date: "", url: "", notes: "" },
  },
  followUps: {
    title: "متابعة",
    fields: [
      { key: "date", label: "تاريخ المتابعة", type: "date" },
      { key: "text", label: "نص المتابعة", type: "textarea", required: true },
    ],
    defaults: { date: today(), text: "" },
  },
};
function RelatedEditor({
  recordKey,
  item,
  onSave,
  onClose,
}: {
  recordKey: RelatedKey;
  item?: RelatedItem;
  onSave: (data: RelatedItem) => Promise<void>;
  onClose: () => void;
}) {
  const config = configs[recordKey];
  const [draft, setDraft] = useState<Record<string, unknown>>(() =>
    item ? { ...item } : { id: crypto.randomUUID(), ...config.defaults },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={`${item ? "تعديل" : "إضافة"} ${config.title}`}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave(draft as RelatedItem);
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "تعذر الحفظ");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body form-grid">
          {config.fields.map((f) => (
            <Field
              key={f.key}
              label={f.label + (f.required ? " *" : "")}
              wide={f.type === "textarea"}
            >
              {f.options ? (
                <select
                  value={String(draft[f.key] ?? "")}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                  }
                >
                  {f.options.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  required={f.required}
                  rows={4}
                  value={String(draft[f.key] ?? "")}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                  }
                />
              ) : (
                <input
                  type={f.type ?? "text"}
                  min={f.type === "number" ? 0 : undefined}
                  max={f.type === "number" ? 100 : undefined}
                  required={f.required}
                  value={String(draft[f.key] ?? "")}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      [f.key]:
                        f.type === "number"
                          ? e.target.value === ""
                            ? null
                            : Number(e.target.value)
                          : e.target.value,
                    }))
                  }
                />
              )}
            </Field>
          ))}
          {error && <div className="alert error span-2">{error}</div>}
        </div>
        <footer className="modal-footer">
          <span>مرتبط بهذا الطالب</span>
          <button className="button primary" disabled={busy}>
            {busy ? "جارٍ الحفظ…" : "حفظ"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function Details({ pairs }: { pairs: [string, unknown][] }) {
  return (
    <dl className="details">
      {pairs.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {value === null || value === undefined || value === ""
              ? "غير مسجل"
              : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export default function Profile({
  student: s,
  observation,
  onBack,
  onEdit,
  onUpdate,
  onExport,
  onPrint,
}: {
  student: Student;
  observation?: Student;
  onBack: () => void;
  onEdit: () => void;
  onUpdate: (s: Student, action: string) => Promise<void>;
  onExport: () => void;
  onPrint: () => void;
}) {
  const seen = observation || s;
  const [tab, setTab] = useState("overview");
  const [editor, setEditor] = useState<{
    key: RelatedKey;
    item?: RelatedItem;
  } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (student: Student, action: string) => {
    setSaving(true);
    setError("");
    try {
      await onUpdate(
        validateStudent({ ...student, updatedAt: new Date().toISOString() }),
        action,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحفظ");
      throw e;
    } finally {
      setSaving(false);
    }
  };
  const remove = async (key: RelatedKey, id: string) => {
    if (!confirm("حذف هذا البند من ملف الطالب؟")) return;
    try {
      await save(
        { ...s, [key]: s[key].filter((x) => x.id !== id) },
        `حذف ${configs[key].title}`,
      );
    } catch {
      /* displayed */
    }
  };
  const controls = (key: RelatedKey, item: RelatedItem) => (
    <div className="record-controls">
      <button
        className="icon-button"
        disabled={saving}
        aria-label={`تعديل ${configs[key].title}`}
        onClick={() => setEditor({ key, item })}
      >
        <Pencil size={15} />
      </button>
      <button
        className="icon-button danger"
        disabled={saving}
        aria-label={`حذف ${configs[key].title}`}
        onClick={() => remove(key, item.id)}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
  const tabs = [
    ["overview", "نظرة عامة", GraduationCap],
    ["academic", "السجل الأكاديمي", BookOpen],
    ["research", "الرسالة والإشراف", FileText],
    ["tasks", "المهام", CheckSquare],
    ["decisions", "القرارات", Calendar],
    ["documents", "الوثائق", FileText],
    ["followUps", "المتابعة", MessageSquare],
    ["evidence", "المصادر والتوثيق", FileText],
  ] as const;
  const sectionHead = (key: RelatedKey, title: string) => (
    <div className="section-line">
      <div>
        <h3>{title}</h3>
        <p className="muted">{number(s[key].length)} سجلًا مرتبطًا بالطالب</p>
      </div>
      <button className="button small" onClick={() => setEditor({ key })}>
        <Plus size={16} />
        إضافة {configs[key].title}
      </button>
    </div>
  );
  return (
    <>
      <button className="back-button" onClick={onBack}>
        <ArrowRight size={17} />
        سجل الطلاب
      </button>
      <div className="profile-cover">
        <div className="profile-cover-pattern" />
        <span>ملف الطالب</span>
        <div className="profile-actions">
          <button className="button glass" onClick={onPrint}>
            <Printer size={16} />
            طباعة
          </button>
          <button className="button glass" onClick={onExport}>
            <Download size={16} />
            تصدير
          </button>
        </div>
      </div>
      <section className="profile-heading">
        <div className="avatar large">
          {s.fullName
            .split(" ")
            .slice(0, 2)
            .map((x) => x[0])
            .join("")}
        </div>
        <div className="profile-name">
          <h1>{s.fullName}</h1>
          <p>
            <bdi>{s.studentNumber}</bdi>
            <span>·</span>
            {s.degree} {s.program}
            <span>·</span>
            {s.cohort
              ? `دفعة ${s.cohort}`
              : `قبول ${formatDate(seen.admissionDate)}`}
          </p>
        </div>
        <Badge tone={statusTone(seen)}>{statusLabel(seen)}</Badge>
        <button className="button" onClick={onEdit}>
          <Pencil size={16} />
          تعديل الملف
        </button>
      </section>
      <section className="panel progress-summary" aria-label="ملخص حالة الطالب">
        <div>
          <small>حالة القيد في الرصد المعروض</small>
          <strong>{statusLabel(seen)}</strong>
          <span>
            {seen.asOfAcademicYear
              ? `${seen.asOfAcademicYear}هـ · ${seen.asOfPeriod}`
              : "رصد غير مؤرخ"}{" "}
            · المصدر {formatDate(seen.sourceDate)}
          </span>
        </div>
        <div>
          <small>المستوى المتوقع زمنيًا</small>
          <strong>{levelLabel(seen)}</strong>
          <span>
            {expectedLevel(seen)
              ? "تقديري من تاريخ القبول؛ لا يثبت الاجتياز"
              : "الحالة المثبتة والمستوى الزمني معلومتان مستقلتان"}
          </span>
        </div>
        <div>
          <small>نتائج المقررات</small>
          <strong>{courseResult(seen)}</strong>
          <button className="text-button" onClick={() => setTab("academic")}>
            السجل الأكاديمي ومصادره ←
          </button>
        </div>
        <details>
          <summary>أساس التقدير</summary>
          <p>{LEVEL_METHOD}</p>
        </details>
      </section>
      <div
        className="profile-tabs"
        role="tablist"
        aria-label="أقسام ملف الطالب"
      >
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            id={`tab-${id}`}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            <Icon size={16} />
            {label}
            {id === "tasks" && s.tasks.some(overdue) && (
              <i className="red-dot" />
            )}
          </button>
        ))}
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "overview" && (
          <div className="profile-grid">
            <div className="profile-main">
              <section className="panel">
                <div className="panel-heading">
                  <h3>المسار الدراسي</h3>
                  <Badge>{s.stage}</Badge>
                </div>
                {s.stage !== "غير موثق" ? (
                  <div className="journey">
                    {knownStages.map((stage, i) => (
                      <div
                        key={stage}
                        className={
                          s.stage === stage
                            ? "current"
                            : knownStages.indexOf(
                                  s.stage as (typeof knownStages)[number],
                                ) > i
                              ? "passed"
                              : ""
                        }
                      >
                        <span>
                          {knownStages.indexOf(
                            s.stage as (typeof knownStages)[number],
                          ) > i ? (
                            <Check size={13} />
                          ) : (
                            i + 1
                          )}
                        </span>
                        <small>{stage}</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">
                    كشف القيد لا يحدد مرحلة الرسالة. راجع «الرسالة والإشراف»
                    للروابط المثبتة و«القرارات» للتكليفات والاعتمادات.
                  </p>
                )}
                <p className="field-note">
                  المسار حسب المرحلة المسجلة؛ لا يثبت اعتماد القرارات أو اكتمال
                  المتطلبات.
                </p>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h3>البيانات الأساسية والأكاديمية</h3>
                  <BookOpen size={18} />
                </div>
                <Details
                  pairs={[
                    ["القسم", s.department],
                    ["البرنامج", `${s.degree} ${s.program}`],
                    ["الجنس", s.gender],
                    ["الجنسية", s.nationality],
                    ["تاريخ القبول", formatDate(seen.admissionDate)],
                    ["دفعة القبول", s.cohort],
                    ["المعدل المسجل في الرصد المعروض", formatGpa(seen)],
                    ["الساعات المجتازة", s.completedCredits],
                    ["الساعات المطلوبة", s.requiredCredits],
                    ["الموعد المستهدف للإنهاء", formatDate(s.expectedEndDate)],
                  ]}
                />
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h3>الرسالة العلمية</h3>
                  <FileText size={18} />
                </div>
                <h3 className="thesis-title">
                  {s.thesisTitle || "لم يسجل عنوان الرسالة بعد"}
                </h3>
                <Details
                  pairs={[
                    ["المشرف الرئيس", s.supervisor],
                    ["المشرف المشارك", s.coSupervisor],
                    ["اعتماد الخطة", formatDate(s.proposalDate)],
                    ["المناقشة", formatDate(s.defenseDate)],
                    ["التخرج المثبت", formatDate(s.graduationDate)],
                  ]}
                />
              </section>
            </div>
            <aside className="profile-aside">
              <section className="panel">
                <div className="panel-heading">
                  <h3>المهام القادمة</h3>
                  <Badge tone={s.tasks.some(overdue) ? "red" : "neutral"}>
                    {number(s.tasks.filter((t) => !t.done).length)} مفتوحة
                  </Badge>
                </div>
                {s.tasks.filter((t) => !t.done).length ? (
                  s.tasks
                    .filter((t) => !t.done)
                    .slice(0, 4)
                    .map((t) => (
                      <div className="compact-task" key={t.id}>
                        <span
                          className={`task-marker ${overdue(t) ? "overdue" : ""}`}
                        />
                        <div>
                          <strong>{t.title}</strong>
                          <small className={overdue(t) ? "danger-text" : ""}>
                            {formatDate(t.dueDate)}
                            {overdue(t) && " · متأخرة"}
                          </small>
                        </div>
                      </div>
                    ))
                ) : (
                  <p className="muted">لا توجد مهام مفتوحة.</p>
                )}
                <button className="text-button" onClick={() => setTab("tasks")}>
                  عرض جميع المهام ←
                </button>
              </section>
              <section className="panel">
                <h3>التواصل</h3>
                <p className="contact-line">
                  <Mail size={16} />
                  <bdi>{s.email || "البريد غير مسجل"}</bdi>
                </p>
                <p className="contact-line">
                  <Phone size={16} />
                  <bdi>{s.phone || "الجوال غير مسجل"}</bdi>
                </p>
              </section>
              <section className="panel source-panel">
                <h3>مصدر البيانات</h3>
                <p>{s.source || "غير مسجل"}</p>
                {s.asOfAcademicYear && (
                  <p>
                    آخر سنة رصد: {s.asOfAcademicYear}هـ؛ ليست تأكيدًا للحالة
                    الحالية.
                  </p>
                )}
                <small>تاريخ المصدر: {formatDate(s.sourceDate)}</small>
                <small>آخر تعديل: {formatDate(s.updatedAt)}</small>
                {!!missing(s).length && (
                  <div className="missing-list">
                    <strong>لاستكمال الملف</strong>
                    {missing(s).map((x) => (
                      <span key={x}>{x}</span>
                    ))}
                  </div>
                )}
              </section>
              {s.notes && (
                <section className="panel">
                  <h3>ملاحظات</h3>
                  <p className="preserve-text">{s.notes}</p>
                </section>
              )}
            </aside>
          </div>
        )}
        {tab === "academic" && (
          <section className="panel">
            <AcademicHistory student={s} />
            {sectionHead("courses", "المقررات المسجلة")}
            <p className="field-note">
              سجل مصدره الإدخال أو الاستيراد؛ لا يستنتج اجتياز الخطة أو معدلًا
              جديدًا.
            </p>
            {s.courses.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>رمز المقرر</th>
                      <th>المقرر</th>
                      <th>الفصل</th>
                      <th>الساعات</th>
                      <th>التقدير</th>
                      <th>الحالة</th>
                      <th>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.courses.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <bdi>{c.code || "—"}</bdi>
                        </td>
                        <td>{c.title}</td>
                        <td>{c.semester || "—"}</td>
                        <td>{c.credits ?? "—"}</td>
                        <td>{c.grade || "—"}</td>
                        <td>
                          <Badge
                            tone={c.result === "مجتاز" ? "green" : "neutral"}
                          >
                            {c.result}
                          </Badge>
                        </td>
                        <td>{controls("courses", c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="السجل الأكاديمي جاهز للاستكمال"
                description="أضف المقررات والتقديرات كما وردت في سجل الطالب."
              />
            )}
          </section>
        )}
        {tab === "research" && (
          <section className="panel">
            <div className="section-line">
              <h3>بيانات الرسالة والإشراف</h3>
              <button className="button small" onClick={onEdit}>
                <Pencil size={15} />
                تعديل البيانات
              </button>
            </div>
            <h2 className="thesis-title">
              {s.thesisTitle || "لم يسجل عنوان الرسالة"}
            </h2>
            <Details
              pairs={[
                ["المشرف الرئيس", s.supervisor],
                ["المشرف المشارك", s.coSupervisor],
                ["المرحلة", s.stage],
                ["اعتماد الخطة", formatDate(s.proposalDate)],
                ["تاريخ المناقشة", formatDate(s.defenseDate)],
                ["تاريخ التخرج المثبت", formatDate(s.graduationDate)],
                ["الموعد المستهدف للإنهاء", formatDate(s.expectedEndDate)],
              ]}
            />
            <ResearchRecords student={s} />
            <div className="info-box">
              أرفق قرارات اعتماد الخطة وتعيين المشرف وتشكيل اللجنة في
              «القرارات»، وروابط الملفات في «الوثائق».
            </div>
          </section>
        )}
        {tab === "evidence" && (
          <section className="panel">
            <div className="panel-heading">
              <h3>المصادر والتوثيق</h3>
              <span className="badge">{number(s.evidence.length)} دليلًا</span>
            </div>
            {s.evidence.length ? (
              <EvidenceRecords student={s} />
            ) : (
              <Empty
                title="لم تضف أدلة مفصلة بعد"
                description="تظهر هنا مراجع الصفوف والصفحات والتواريخ الأصلية عند استيراد سجل موثق."
              />
            )}
          </section>
        )}
        {tab === "tasks" && (
          <section className="panel">
            {sectionHead("tasks", "المهام والمواعيد")}
            {s.tasks.length ? (
              <div className="record-list">
                {s.tasks.map((t) => (
                  <div
                    key={t.id}
                    className={`task-row ${t.done ? "done" : ""}`}
                  >
                    <button
                      className={`task-check ${t.done ? "checked" : ""}`}
                      disabled={saving}
                      aria-label={t.done ? "إعادة فتح المهمة" : "إنجاز المهمة"}
                      onClick={async () => {
                        try {
                          await save(
                            {
                              ...s,
                              tasks: s.tasks.map((x) =>
                                x.id === t.id ? { ...x, done: !x.done } : x,
                              ),
                            },
                            t.done ? "إعادة فتح مهمة" : "إنجاز مهمة",
                          );
                        } catch {
                          /* displayed */
                        }
                      }}
                    >
                      {t.done && <Check size={14} />}
                    </button>
                    <div className="grow">
                      <strong>{t.title}</strong>
                      <p>
                        {t.owner || "لم يحدد المسؤول"} · {formatDate(t.dueDate)}
                      </p>
                    </div>
                    <Badge
                      tone={
                        t.done
                          ? "green"
                          : overdue(t)
                            ? "red"
                            : t.priority === "عالية"
                              ? "amber"
                              : "neutral"
                      }
                    >
                      {t.done ? "منجزة" : overdue(t) ? "متأخرة" : t.priority}
                    </Badge>
                    {controls("tasks", t)}
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="لا توجد مهام مسجلة"
                description="أضف مهام واضحة ومواعيدها ومسؤول المتابعة."
              />
            )}
          </section>
        )}
        {tab === "decisions" && (
          <section className="panel">
            {sectionHead("decisions", "القرارات والمجالس")}
            {s.decisions.length ? (
              <div className="record-list">
                {s.decisions.map((d) => (
                  <article className="record-card" key={d.id}>
                    <div className="record-top">
                      <span className="record-icon">
                        <FileText size={19} />
                      </span>
                      <div className="grow">
                        <h3>{d.title}</h3>
                        <p>
                          {d.council || "المجلس غير مسجل"} ·{" "}
                          {formatDate(d.date)}
                        </p>
                      </div>
                      {controls("decisions", d)}
                    </div>
                    <Details
                      pairs={[
                        ["رقم القرار", d.number],
                        ["الصفحة", d.page],
                      ]}
                    />
                    {d.notes && <p className="preserve-text">{d.notes}</p>}
                    {d.url && (
                      <a
                        className="text-link"
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        فتح المصدر <ExternalLink size={14} />
                      </a>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="قرارات موثقة في مكان واحد"
                description="سجل القرار ورقمه ومجلسه وصفحته ورابط المصدر."
              />
            )}
          </section>
        )}
        {tab === "documents" && (
          <section className="panel">
            {sectionHead("documents", "روابط الوثائق")}
            <p className="field-note">
              تحفظ الروابط فقط؛ تبقى الملفات وصلاحياتها في مصدرها الأصلي.
            </p>
            {s.documents.length ? (
              <div className="document-grid">
                {s.documents.map((d) => (
                  <article className="document-card" key={d.id}>
                    <div className="section-line">
                      <span className="record-icon">
                        <FileText size={24} />
                      </span>
                      {controls("documents", d)}
                    </div>
                    <h3>{d.title}</h3>
                    <p>
                      {d.type || "وثيقة"} · {formatDate(d.date)}
                    </p>
                    {d.notes && <p>{d.notes}</p>}
                    <a
                      className="text-link"
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      فتح الوثيقة <ExternalLink size={14} />
                    </a>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="اربط وثائق الطالب"
                description="مثل الخطة المعتمدة، وتقرير التقدم، وقرار المناقشة، والرسالة النهائية."
              />
            )}
          </section>
        )}
        {tab === "followUps" && (
          <section className="panel">
            {sectionHead("followUps", "سجل المتابعة")}
            {s.followUps.length ? (
              <div className="timeline">
                {[...s.followUps]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((n) => (
                    <article key={n.id}>
                      <span className="timeline-dot" />
                      <div className="section-line">
                        <small>{formatDate(n.date)}</small>
                        {controls("followUps", n)}
                      </div>
                      <p className="preserve-text">{n.text}</p>
                    </article>
                  ))}
              </div>
            ) : (
              <Empty
                title="ابدأ سجل متابعة الطالب"
                description="وثق اللقاءات والملاحظات والإجراءات التالية مع تواريخها."
              />
            )}
          </section>
        )}
      </div>
      {editor && (
        <RelatedEditor
          recordKey={editor.key}
          item={editor.item}
          onClose={() => setEditor(null)}
          onSave={async (item) => {
            const items = s[editor.key] as RelatedItem[];
            await save(
              {
                ...s,
                [editor.key]: editor.item
                  ? items.map((x) => (x.id === item.id ? item : x))
                  : [...items, item],
              },
              `${editor.item ? "تعديل" : "إضافة"} ${configs[editor.key].title}`,
            );
          }}
        />
      )}
    </>
  );
}
export function PrintableStudents({
  students,
  demo,
  context = "",
}: {
  students: Student[];
  demo: boolean;
  context?: string;
}) {
  return (
    <div className="print-report" dir="rtl">
      {students.map((s) => (
        <article className="print-student" key={s.id}>
          <header>
            <span>جامعة الطائف · كلية الشريعة والأنظمة</span>
            <span>مدار | الدراسات العليا</span>
          </header>
          {demo && (
            <p className="print-demo">
              بيانات افتراضية للتجربة — ليست سجلات فعلية
            </p>
          )}
          <h1>ملف الطالب: {s.fullName}</h1>
          {context && (
            <p className="field-note">
              نطاق اختيار الملفات: {context}. يرفق الملف تاريخ الرصد والرسائل
              ومصادرها كاملة.
            </p>
          )}
          <Details
            pairs={[
              ["الرقم الجامعي", s.studentNumber],
              ["البرنامج", `${s.degree} ${s.program}`],
              ["القسم", s.department],
              ["الجنس", s.gender],
              ["الجنسية", s.nationality],
              ["دفعة القبول", s.cohort],
              ["حالة القيد", s.status],
              ["المستوى المتوقع زمنيًا", levelLabel(s)],
              ["نتائج المقررات المرفقة", courseResult(s)],
              ["المرحلة", s.stage],
              ["آخر سنة رصد معروضة", s.asOfAcademicYear],
              ["الفصل المرصود", s.asOfPeriod],
              ["تاريخ استخراج الكشف", formatDate(s.sourceDate)],
              ["تاريخ القبول", formatDate(s.admissionDate)],
              ["البريد", s.email],
              ["الجوال", s.phone],
              ["المعدل المسجل", formatGpa(s)],
              ["الساعات المجتازة", s.completedCredits],
              ["الساعات المطلوبة", s.requiredCredits],
            ]}
          />
          <p className="field-note">{LEVEL_METHOD}</p>
          <h2>الرسالة والإشراف</h2>
          <p>{s.thesisTitle || "لم يسجل عنوان الرسالة"}</p>
          <Details
            pairs={[
              ["المشرف", s.supervisor],
              ["المشارك", s.coSupervisor],
              ["اعتماد الخطة", formatDate(s.proposalDate)],
              ["المناقشة", formatDate(s.defenseDate)],
              ["التخرج المثبت", formatDate(s.graduationDate)],
              ["الموعد المستهدف", formatDate(s.expectedEndDate)],
            ]}
          />
          <ResearchRecords student={s} />
          <AcademicHistory student={s} />
          <h2>المقررات</h2>
          {s.courses.length ? (
            <table>
              <thead>
                <tr>
                  <th>الرمز</th>
                  <th>المقرر</th>
                  <th>الفصل</th>
                  <th>الساعات</th>
                  <th>التقدير</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {s.courses.map((c) => (
                  <tr key={c.id}>
                    <td>{c.code}</td>
                    <td>{c.title}</td>
                    <td>{c.semester}</td>
                    <td>{c.credits ?? "—"}</td>
                    <td>{c.grade}</td>
                    <td>{c.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>غير مسجلة</p>
          )}
          <h2>المهام</h2>
          {s.tasks.length ? (
            s.tasks.map((t) => (
              <p key={t.id}>
                {t.done ? "☑" : "☐"} {t.title} · {t.owner || "المسؤول غير مسجل"}{" "}
                · {formatDate(t.dueDate)} · {t.priority}
              </p>
            ))
          ) : (
            <p>لا توجد مهام</p>
          )}
          <h2>القرارات</h2>
          {s.decisions.length ? (
            s.decisions.map((d) => (
              <div key={d.id}>
                <strong>{d.title}</strong>
                <p>
                  {d.number} · {d.council} · {formatDate(d.date)} · صفحة{" "}
                  {d.page || "غير مسجلة"}
                </p>
                <p>{d.notes}</p>
                {d.url && <a href={d.url}>{d.url}</a>}
              </div>
            ))
          ) : (
            <p>لا توجد قرارات</p>
          )}
          <h2>روابط الوثائق</h2>
          {s.documents.length ? (
            s.documents.map((d) => (
              <div key={d.id}>
                <p>
                  {d.title} · {d.type} · {formatDate(d.date)}
                </p>
                <a href={d.url}>{d.url}</a>
                <p>{d.notes}</p>
              </div>
            ))
          ) : (
            <p>لا توجد روابط وثائق</p>
          )}
          <h2>المتابعة</h2>
          {s.followUps.length ? (
            s.followUps.map((n) => (
              <p key={n.id}>
                {formatDate(n.date)}: {n.text}
              </p>
            ))
          ) : (
            <p>لا توجد متابعات</p>
          )}
          {s.notes && (
            <>
              <h2>ملاحظات</h2>
              <p className="preserve-text">{s.notes}</p>
            </>
          )}
          {s.evidence.length > 0 && (
            <>
              <h2>المصادر والتوثيق</h2>
              <EvidenceRecords student={s} />
            </>
          )}
          <footer>
            <p>
              المصدر: {s.source || "غير مسجل"} · تاريخ المصدر:{" "}
              {formatDate(s.sourceDate)} · آخر تعديل: {formatDate(s.updatedAt)}
            </p>
            <p>
              تاريخ الطباعة: {formatDate(today())} · القيم الفارغة غير متاحة في
              السجل. المواعيد المستهدفة ليست مددًا نظامية معتمدة.
            </p>
          </footer>
        </article>
      ))}
    </div>
  );
}
