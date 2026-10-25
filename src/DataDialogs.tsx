import { useCallback, useMemo, useState } from "react";
import {
  Download,
  Upload,
  FileSpreadsheet,
  Printer,
  Check,
  ArrowLeft,
} from "lucide-react";
import { Modal, Field, number } from "./ui";
import {
  columns,
  defaultColumns,
  exportCSV,
  exportExcel,
  exportBackup,
  exportRows,
  readImport,
  guessMapping,
  planImport,
} from "./io";
import type { Column, ImportFile } from "./io";
import type { Student, Workspace } from "./model";
export function ExportDialog({
  students,
  workspace,
  onClose,
  onPrint,
}: {
  students: Student[];
  workspace: Workspace;
  onClose: () => void;
  onPrint: (s: Student[]) => void;
}) {
  const [selected, setSelected] = useState<Column[]>(defaultColumns);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const rows = exportRows(students, selected);
  const run = async (format: string) => {
    setBusy(format);
    setError("");
    try {
      if (format === "Excel") await exportExcel(students, selected);
      if (format === "CSV") exportCSV(students, selected);
      if (format === "JSON") exportBackup(workspace, students);
    } catch {
      setError("تعذر إنشاء الملف. حاول مجددًا أو اختر صيغة أخرى.");
    } finally {
      setBusy("");
    }
  };
  return (
    <Modal
      title="تصدير بيانات الطلاب"
      subtitle={`${number(students.length)} سجلًا ضمن النطاق المحدد`}
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        <div className="section-line">
          <h3>الحقول المطلوبة</h3>
          <button
            className="text-button"
            onClick={() =>
              setSelected(
                selected.length === columns.length
                  ? defaultColumns
                  : columns.map(([k]) => k),
              )
            }
          >
            {selected.length === columns.length
              ? "الحقول الأساسية"
              : "تحديد جميع الحقول"}
          </button>
        </div>
        <div className="column-picker">
          {columns.map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={selected.includes(key)}
                onChange={(e) =>
                  setSelected((v) =>
                    e.target.checked ? [...v, key] : v.filter((k) => k !== key),
                  )
                }
              />
              {label}
            </label>
          ))}
        </div>
        <h3>معاينة ملف البيانات</h3>
        <div className="table-wrap preview-table">
          <table>
            <thead>
              <tr>
                {columns
                  .filter(([k]) => selected.includes(k))
                  .map(([key, label]) => (
                    <th key={key}>{label}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 4).map((r, i) => (
                <tr key={i}>
                  {Object.values(r).map((v, j) => (
                    <td key={j}>{String(v) || "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="info-box">
          Excel يتضمن أوراقًا مستقلة للمقررات والمهام والقرارات وروابط الوثائق
          والمتابعة. CSV للحقول المختارة فقط. JSON نسخة كاملة قابلة لإعادة
          الاستيراد. الطباعة تشمل ملف الطالب الكامل.
        </div>
        {error && <p className="alert error">{error}</p>}
      </div>
      <footer className="modal-footer">
        <span>المعاينة تعرض أول أربعة سجلات</span>
        <div className="button-row">
          <button
            className="button"
            disabled={!students.length || !!busy}
            onClick={() => {
              onClose();
              onPrint(students);
            }}
          >
            <Printer size={16} />
            طباعة / PDF
          </button>
          {["JSON", "CSV", "Excel"].map((f) => (
            <button
              key={f}
              className={`button ${f === "Excel" ? "primary" : ""}`}
              disabled={!students.length || !selected.length || !!busy}
              onClick={() => run(f)}
            >
              <Download size={16} />
              {busy === f ? "جارٍ الإنشاء…" : f}
            </button>
          ))}
        </div>
      </footer>
    </Modal>
  );
}
export function ImportDialog({
  existing,
  onImport,
  onClose,
}: {
  existing: Student[];
  onImport: (s: Student[]) => Promise<void>;
  onClose: () => void;
}) {
  const [file, setFile] = useState<ImportFile | null>(null);
  const [name, setName] = useState("");
  const [mapping, setMapping] = useState<Partial<Record<Column, string>>>({});
  const [update, setUpdate] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  const plan = useMemo(
    () => (file ? planImport(file, mapping, existing, update) : null),
    [file, mapping, existing, update],
  );
  const required = [
    "studentNumber",
    "fullName",
    "program",
    "degree",
  ] as Column[];
  return (
    <Modal
      title="استيراد بيانات الطلاب"
      subtitle="معاينة ومراجعة قبل حفظ أي سجل"
      onClose={close}
      wide
    >
      <div className="modal-body">
        {!file ? (
          <label className="upload-zone">
            <span className="upload-icon">
              <Upload size={28} />
            </span>
            <h3>اختر ملف بيانات الطلاب</h3>
            <p>Excel (.xlsx) أو CSV أو نسخة مدار (.json)</p>
            <span className="button primary">اختيار ملف</span>
            <small>20 ميجابايت كحد أقصى · ورقة Excel الأولى فقط</small>
            <input
              type="file"
              accept=".xlsx,.csv,.json"
              aria-label="اختيار ملف الاستيراد"
              disabled={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                setError("");
                try {
                  const data = await readImport(f);
                  setFile(data);
                  setName(f.name);
                  setMapping(guessMapping(data.headers));
                  setPreview(!!data.backup);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "تعذر قراءة الملف");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        ) : (
          <>
            <div className="file-label">
              <FileSpreadsheet size={22} />
              <div>
                <strong>{name}</strong>
                <small>
                  {number(file.backup?.students.length ?? file.rows.length)}{" "}
                  سجلًا
                </small>
              </div>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setFile(null);
                  setPreview(false);
                  setError("");
                }}
              >
                تغيير الملف
              </button>
            </div>
            {!file.backup && !preview && (
              <>
                <div className="section-line">
                  <h3>مطابقة أعمدة الملف</h3>
                  <span className="muted">* مطلوب</span>
                </div>
                <div className="form-grid mapping-grid">
                  {columns.map(([key, label]) => (
                    <Field
                      key={key}
                      label={label + (required.includes(key) ? " *" : "")}
                    >
                      <select
                        value={mapping[key] ?? ""}
                        onChange={(e) =>
                          setMapping((v) => ({
                            ...v,
                            [key]: e.target.value || undefined,
                          }))
                        }
                      >
                        <option value="">عدم استيراد</option>
                        {file.headers.map((h) => (
                          <option key={h}>{h}</option>
                        ))}
                      </select>
                    </Field>
                  ))}
                </div>
                <button
                  className="button primary"
                  disabled={!required.every((k) => mapping[k])}
                  onClick={() => setPreview(true)}
                >
                  مراجعة السجلات <ArrowLeft size={16} />
                </button>
              </>
            )}
            {preview && plan && (
              <>
                <div className="import-counts">
                  <span>
                    <strong>{number(plan.added)}</strong> جديد
                  </span>
                  <span>
                    <strong>{number(plan.updated)}</strong> تحديث
                  </span>
                  <span>
                    <strong>{number(plan.skipped)}</strong> موجود — سيتجاوز
                  </span>
                  <span className={plan.errors.length ? "danger-text" : ""}>
                    <strong>{number(plan.errors.length)}</strong> خطأ
                  </span>
                </div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={update}
                    onChange={(e) => setUpdate(e.target.checked)}
                  />
                  تحديث السجلات المطابقة بدل تجاوزها
                </label>
                <p className="field-note">
                  المطابقة بالرقم الجامعي + البرنامج + الدرجة. في CSV وExcel
                  تُحدّث القيم غير الفارغة فقط وتُحفظ السجلات المرتبطة. في JSON
                  تُستبدل بيانات السجل المطابق كاملة، بما فيها المقررات والمهام
                  والوثائق.
                </p>
                {!!plan.errors.length && (
                  <div className="alert error">
                    <strong>صحح الأخطاء في الملف قبل الاستيراد</strong>
                    {plan.errors.slice(0, 8).map((e, i) => (
                      <p key={i}>{e}</p>
                    ))}
                    {plan.errors.length > 8 && <p>وأخطاء أخرى…</p>}
                  </div>
                )}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>الرقم الجامعي</th>
                        <th>الاسم</th>
                        <th>البرنامج</th>
                        <th>الدرجة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.students.slice(0, 6).map((s) => (
                        <tr key={s.id}>
                          <td dir="ltr">{s.studentNumber}</td>
                          <td>{s.fullName}</td>
                          <td>{s.program}</td>
                          <td>{s.degree}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="field-note">
                  المعاينة تعرض أول ستة سجلات قابلة للحفظ. لن يحذف الاستيراد أي
                  سجل خارج الملف.
                </p>
                {!file.backup && (
                  <button
                    className="text-button"
                    onClick={() => setPreview(false)}
                  >
                    العودة لمطابقة الأعمدة
                  </button>
                )}
              </>
            )}
          </>
        )}
        {busy && !file && <p>جارٍ قراءة الملف…</p>}
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="modal-footer">
        <span>لا تُرسل الملفات إلى خادم</span>
        <div className="button-row">
          <button className="button" disabled={busy} onClick={close}>
            إغلاق
          </button>
          {preview && plan && (
            <button
              className="button primary"
              disabled={busy || !!plan.errors.length || !plan.students.length}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await onImport(plan.students);
                  onClose();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "تعذر الحفظ");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Check size={16} />
              {busy
                ? "جارٍ الحفظ…"
                : `حفظ ${number(plan.students.length)} سجلًا`}
            </button>
          )}
        </div>
      </footer>
    </Modal>
  );
}
