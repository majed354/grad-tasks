import { useState, useCallback } from "react";
import { Save } from "lucide-react";
import { Modal, Field } from "./ui";
import { programs, degrees, statuses, stages } from "./catalog";
import { newStudent, digits, validateStudent } from "./model";
import type { Student } from "./model";
export default function StudentEditor({
  student,
  onSave,
  onClose,
}: {
  student?: Student;
  onSave: (s: Student) => Promise<void>;
  onClose: () => void;
}) {
  const [initial] = useState(() => student ?? newStudent());
  const [draft, setDraft] = useState<Student>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => {
    if (
      JSON.stringify(initial) === JSON.stringify(draft) ||
      confirm("إغلاق النموذج دون حفظ التعديلات؟")
    )
      onClose();
  }, [initial, draft, onClose]);
  const set = (key: keyof Student, value: unknown) =>
    setDraft((s) => ({ ...s, [key]: value }));
  const input = (
    key: keyof Student,
    label: string,
    type = "text",
    required = false,
  ) => (
    <Field key={key} label={label + (required ? " *" : "")}>
      <input
        type={type}
        required={required}
        value={(draft[key] as string) ?? ""}
        onChange={(e) =>
          set(
            key,
            key === "studentNumber" ? digits(e.target.value) : e.target.value,
          )
        }
      />
    </Field>
  );
  const numeric = (
    key: "gpa" | "completedCredits" | "requiredCredits",
    label: string,
  ) => (
    <Field key={key} label={label}>
      <input
        type="number"
        min="0"
        step={key === "gpa" ? ".01" : "1"}
        max={key === "gpa" ? (draft.gpaScale ?? 5) : 1000}
        value={draft[key] ?? ""}
        onChange={(e) =>
          set(key, e.target.value === "" ? null : Number(e.target.value))
        }
      />
    </Field>
  );
  return (
    <Modal
      title={student ? "تعديل بيانات الطالب" : "إضافة طالب"}
      subtitle="ابدأ بالبيانات الأساسية، واستكمل ملف الطالب تدريجيًا. * حقول مطلوبة"
      onClose={close}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave(
              validateStudent({
                ...draft,
                fullName: draft.fullName.trim(),
                studentNumber: draft.studentNumber.trim(),
                program: draft.program.trim(),
                updatedAt: new Date().toISOString(),
              }),
            );
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "تعذر الحفظ");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body editor-body">
          {!draft.academicSnapshots.length && (
            <p className="info-box">
              يُحفظ هذا الملف في السجل العام. إضافته أو تعديل حالته لا يغيّر
              تعداد كشف سنوي حتى يوثّق رصده في ذلك الفصل.
            </p>
          )}
          <div className="form-section">
            <h3>
              01 <span>البيانات الأساسية</span>
            </h3>
            <div className="form-grid">
              {input("fullName", "اسم الطالب / الطالبة", "text", true)}
              {input("studentNumber", "الرقم الجامعي", "text", true)}
              <Field label="الدرجة *">
                <select
                  value={draft.degree}
                  onChange={(e) => set("degree", e.target.value)}
                >
                  {degrees.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="البرنامج *">
                <input
                  list="program-options"
                  value={draft.program}
                  required
                  onChange={(e) => {
                    const value = e.target.value;
                    const p = programs.find(
                      (p) => p.name === value && p.degree === draft.degree,
                    );
                    setDraft((s) => ({
                      ...s,
                      program: value,
                      department: p?.department ?? s.department,
                    }));
                  }}
                />
                <datalist id="program-options">
                  {programs
                    .filter((p) => p.degree === draft.degree)
                    .map((p) => (
                      <option key={p.name} value={p.name} />
                    ))}
                </datalist>
              </Field>
              {input("department", "القسم")}
              {input("cohort", "دفعة القبول (هجري)")}
              <Field label="الجنس">
                <select
                  value={draft.gender}
                  onChange={(e) => set("gender", e.target.value)}
                >
                  {["غير محدد", "ذكر", "أنثى"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              {input("nationality", "الجنسية")}
              {input("email", "البريد الإلكتروني", "email")}
              {input("phone", "الجوال", "tel")}
            </div>
          </div>
          <div className="form-section">
            <h3>
              02 <span>القيد والمسار الأكاديمي</span>
            </h3>
            <div className="form-grid">
              <Field label="حالة القيد">
                <select
                  value={draft.status}
                  onChange={(e) => set("status", e.target.value)}
                >
                  {statuses.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="المرحلة">
                <select
                  value={draft.stage}
                  onChange={(e) => set("stage", e.target.value)}
                >
                  {stages.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              {input("admissionDate", "تاريخ القبول", "date")}
              {input(
                "admissionPeriod",
                "فصل بدء الدراسة الموثق (مثل 481؛ اختياري)",
              )}
              {input("expectedEndDate", "الموعد المستهدف للإنهاء", "date")}
              {numeric("gpa", "المعدل المسجل في المصدر")}
              <Field label="مقياس المعدل">
                <select
                  value={draft.gpaScale ?? ""}
                  onChange={(e) =>
                    set(
                      "gpaScale",
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                >
                  <option value="">غير موثق</option>
                  <option value={5}>5</option>
                  <option value={4}>4</option>
                </select>
              </Field>
              {numeric("completedCredits", "الساعات المجتازة المسجلة")}
              {numeric("requiredCredits", "الساعات المطلوبة حسب الخطة")}
            </div>
            <p className="field-note">
              لا يحسب الموقع المعدل أو استيفاء الخطة تلقائيًا. المواعيد المدخلة
              أهداف للمتابعة ولا تمثل مددًا نظامية معتمدة.
            </p>
          </div>
          <div className="form-section">
            <h3>
              03 <span>الرسالة والإشراف</span>
            </h3>
            <div className="form-grid">
              <Field label="عنوان الرسالة" wide>
                <textarea
                  rows={2}
                  value={draft.thesisTitle}
                  onChange={(e) => set("thesisTitle", e.target.value)}
                />
              </Field>
              {input("supervisor", "المشرف الرئيس")}
              {input("coSupervisor", "المشرف المشارك")}
              {input("proposalDate", "تاريخ اعتماد الخطة", "date")}
              {input("defenseDate", "تاريخ المناقشة", "date")}
              {input("graduationDate", "تاريخ التخرج المثبت", "date")}
            </div>
          </div>
          <div className="form-section">
            <h3>
              04 <span>المصدر والملاحظات</span>
            </h3>
            <div className="form-grid">
              {input("source", "مصدر البيانات")}
              {input("sourceDate", "تاريخ المصدر", "date")}
              <Field label="ملاحظات عامة" wide>
                <textarea
                  rows={3}
                  value={draft.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </Field>
            </div>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
        </div>
        <footer className="modal-footer">
          <span>البيانات تُحفظ في هذا المتصفح</span>
          <div className="button-row">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={close}
            >
              إلغاء
            </button>
            <button type="submit" className="button primary" disabled={busy}>
              <Save size={17} />
              {busy ? "جارٍ الحفظ…" : "حفظ بيانات الطالب"}
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}
