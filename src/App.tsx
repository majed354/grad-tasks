import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  FileDown,
  LibraryBig,
  Settings,
  GraduationCap,
  Upload,
  Download,
  ChevronLeft,
  ArrowUpLeft,
  Menu,
  X,
  ShieldCheck,
  FlaskConical,
  CalendarDays,
  CircleHelp,
  Check,
  FolderOpen,
  Clock3,
  ArrowLeft,
  Database,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { Badge, Empty, Modal, SearchBox, formatDate, number } from "./ui";
import { loadWorkspace, saveWorkspace } from "./storage";
import {
  emptyWorkspace,
  normalize,
  studentKey,
  missing,
  overdue,
  today,
} from "./model";
import type { Student, Workspace } from "./model";
import { programs, sources } from "./catalog";
import { exportBackup, columns, download } from "./io";
import { demoWorkspace } from "./demo";
import StudentEditor from "./StudentEditor";
import StudentDirectory, { ProgramSummary } from "./StudentDirectory";
import type { DirectoryMemory } from "./StudentDirectory";
import { filterPopulation } from "./progress";
import Profile, { PrintableStudents } from "./Profile";
import { ExportDialog, ImportDialog } from "./DataDialogs";
import {
  academicScope,
  availableYears,
  semesterName,
  DEFAULT_ACADEMIC_YEAR,
  yearLabel,
} from "./academic";
type Page =
  "dashboard" | "students" | "tasks" | "reports" | "sources" | "settings";
const navigation = [
  { id: "dashboard", label: "ملخص البرامج", icon: LayoutDashboard },
  { id: "students", label: "الطلاب والحالات", icon: Users },
  { id: "tasks", label: "المهام والمواعيد", icon: CheckSquare },
  { id: "reports", label: "التقارير والتصدير", icon: FileDown },
  { id: "sources", label: "المصادر والربط", icon: LibraryBig },
  { id: "settings", label: "إعدادات المساحة", icon: Settings },
] as const;
export default function App() {
  const directoryMemory = useRef<DirectoryMemory>({});
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const current = useRef(workspace);
  const lock = useRef(false);
  const [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState(""),
    [demo, setDemo] = useState(false),
    [page, setPage] = useState<Page>("students"),
    [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState(""),
    [degree, setDegree] = useState(""),
    [program, setProgram] = useState("");
  const [academicYear, setAcademicYear] = useState(DEFAULT_ACADEMIC_YEAR);
  const [academicPeriod, setAcademicPeriod] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null),
    [editor, setEditor] = useState<Student | "new" | null>(null),
    [importing, setImporting] = useState(false),
    [exporting, setExporting] = useState<Student[] | null>(null),
    [printStudents, setPrintStudents] = useState<Student[]>([]),
    [printPreview, setPrintPreview] = useState(false),
    [toast, setToast] = useState(""),
    [taskFilter, setTaskFilter] = useState("open");
  const accept = (w: Workspace) => {
    current.current = w;
    setWorkspace(w);
  };
  useEffect(() => {
    loadWorkspace()
      .then((w) => {
        accept(w);
        setReady(true);
      })
      .catch(() =>
        setLoadError(
          "تعذر فتح مخزن المتصفح. استخدم متصفحًا يسمح بالتخزين المحلي، ثم أعد التحميل. لم يتم استبدال أي بيانات.",
        ),
      );
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const scope = useMemo(
    () => academicScope(workspace.students, academicYear, academicPeriod),
    [workspace.students, academicYear, academicPeriod],
  );
  const population = useMemo(
    () => filterPopulation(scope.students, program, degree),
    [scope.students, program, degree],
  );
  const scopeLabel =
    scope.label +
    (program ? " · " + program : " · جميع البرامج") +
    (degree ? " · " + degree : "");
  const scopeIds = useMemo(
    () => new Set(population.map((s) => s.id)),
    [population],
  );
  const years = useMemo(
    () => availableYears(workspace.students),
    [workspace.students],
  );
  const navigate = (p: Page) => {
    setPage(p);
    setProfileId(null);
    setMobileNav(false);
    window.scrollTo({ top: 0 });
  };
  const persist = async (
    recipe: (w: Workspace) => Workspace,
    action: string,
    studentId = "",
  ) => {
    if (lock.current) throw new Error("انتظر اكتمال الحفظ الحالي.");
    lock.current = true;
    try {
      const base = current.current;
      const next = recipe(base);
      next.activity = [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          action,
          studentId,
        },
        ...base.activity,
      ].slice(0, 200);
      accept(
        demo
          ? { ...next, revision: base.revision + 1 }
          : await saveWorkspace(next, base.revision),
      );
      setToast(
        demo ? "تم التعديل في التجربة فقط" : action + " — تم الحفظ في المتصفح",
      );
    } finally {
      lock.current = false;
    }
  };
  const saveStudent = async (s: Student, action = "حفظ بيانات الطالب") =>
    persist(
      (w) => {
        if (
          w.students.some(
            (x) => studentKey(x) === studentKey(s) && x.id !== s.id,
          )
        )
          throw new Error("يوجد سجل بالرقم الجامعي والبرنامج والدرجة نفسها.");
        return {
          ...w,
          students: w.students.some((x) => x.id === s.id)
            ? w.students.map((x) => (x.id === s.id ? s : x))
            : [...w.students, s],
        };
      },
      action,
      s.id,
    );
  const startDemo = () => {
    accept(demoWorkspace());
    setDemo(true);
    setProfileId(null);
    setPage("students");
    setAcademicYear(DEFAULT_ACADEMIC_YEAR);
    setAcademicPeriod("");
    setToast(
      "أنت الآن في بيانات افتراضية. التعديلات لن تحفظ بعد إغلاق التجربة.",
    );
  };
  const leaveDemo = async () => {
    try {
      accept(await loadWorkspace());
      setDemo(false);
      setProfileId(null);
      setToast("عدت إلى بيانات هذا المتصفح");
    } catch {
      setToast("تعذر فتح البيانات المحلية. أعد المحاولة.");
    }
  };
  const profile = workspace.students.find((s) => s.id === profileId);
  const allTasks = workspace.students
    .filter((s) => scopeIds.has(s.id))
    .flatMap((s) => s.tasks.map((t) => ({ ...t, student: s })))
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const openTasks = allTasks.filter((t) => !t.done);
  const lateTasks = allTasks.filter(overdue);
  const incomplete = population.filter((s) => missing(s).length);
  const openProfile = (id: string) => {
    setProfileId(id);
    setMobileNav(false);
    window.scrollTo({ top: 0 });
  };
  const print = useCallback((students: Student[]) => {
    setPrintStudents(students);
    setPrintPreview(true);
  }, []);
  const clearFilters = () => {
    setQuery("");
    setDegree("");
    setProgram("");
    directoryMemory.current = {};
  };
  const deleteStudent = async (s: Student) => {
    if (
      !confirm(
        `حذف ملف ${s.fullName} وجميع سجلاته المرتبطة من هذا المتصفح؟ يفضل تصدير نسخة JSON أولًا.`,
      )
    )
      return;
    try {
      await persist(
        (w) => ({ ...w, students: w.students.filter((x) => x.id !== s.id) }),
        "حذف ملف طالب",
        s.id,
      );
    } catch (e) {
      setToast(e instanceof Error ? e.message : "تعذر الحذف");
    }
  };
  if (loadError)
    return (
      <div className="fatal">
        <ShieldCheck size={32} />
        <h1>تعذر فتح مساحة العمل</h1>
        <p>{loadError}</p>
        <button className="button primary" onClick={() => location.reload()}>
          إعادة المحاولة
        </button>
      </div>
    );
  if (!ready)
    return (
      <div className="fatal">
        <GraduationCap size={36} />
        <p>جارٍ فتح مساحة العمل…</p>
      </div>
    );
  return (
    <>
      <div className="app-shell">
        {mobileNav && (
          <button
            className="nav-backdrop"
            aria-label="إغلاق القائمة"
            onClick={() => setMobileNav(false)}
          />
        )}
        <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate("students");
            }}
          >
            <span className="brand-mark">
              <GraduationCap size={30} />
            </span>
            <div>
              <strong>
                مدار<span> MADAR</span>
              </strong>
              <small>مساحة الدراسات العليا</small>
            </div>
          </a>
          <div className="institution">
            <span className="institution-mark">ط</span>
            <div>
              <strong>جامعة الطائف</strong>
              <small>كلية الشريعة والأنظمة</small>
            </div>
            <span className="live-dot" />
          </div>
          <span className="nav-label">مساحة العمل</span>
          <nav>
            {navigation.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={page === id && !profile ? "active" : ""}
                onClick={() => navigate(id)}
              >
                <Icon size={19} />
                {label}
                {id === "tasks" && !!lateTasks.length && (
                  <span className="nav-count">{number(lateTasks.length)}</span>
                )}
                {id === "students" && (
                  <span className="nav-count">
                    {scope.available ? number(population.length) : "—"}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-help">
              <ShieldCheck size={21} />
              <strong>بياناتك في مساحة جهازك</strong>
              <p>احفظ نسخة احتياطية عند كل تحديث مهم.</p>
              <button onClick={() => navigate("settings")}>
                إدارة المساحة <ArrowUpLeft size={15} />
              </button>
            </div>
            <div className="workspace-label">
              <span className="avatar">م</span>
              <div>
                <strong>مساحة عمل محلية</strong>
                <small>{demo ? "وضع التجربة" : "الحفظ في هذا المتصفح"}</small>
              </div>
              <Settings size={17} />
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-menu"
                aria-label="فتح القائمة"
                onClick={() => setMobileNav((v) => !v)}
              >
                {mobileNav ? <X size={21} /> : <Menu size={21} />}
              </button>
              <span>الدراسات العليا</span>
              <ChevronLeft size={15} />
              <strong>
                {profile
                  ? "ملف الطالب"
                  : navigation.find((n) => n.id === page)?.label}
              </strong>
            </div>
            <div className="topbar-meta">
              <span className="date-label">
                <CalendarDays size={15} />
                {formatDate(today())}
              </span>
              <span className={`mode-pill ${demo ? "demo" : ""}`}>
                {demo ? (
                  <FlaskConical size={14} />
                ) : (
                  <span className="live-dot" />
                )}
                {demo ? "بيانات افتراضية" : "حفظ محلي"}
              </span>
              <button
                className="icon-button"
                aria-label="معلومات مساحة العمل"
                onClick={() => navigate("settings")}
              >
                <CircleHelp size={20} />
              </button>
            </div>
          </header>
          {demo && (
            <div className="demo-banner">
              <span>
                <FlaskConical size={16} />
                أنت تستعرض بيانات افتراضية للتجربة. لا تمثل طلابًا حقيقيين.
              </span>
              <button onClick={leaveDemo}>
                إنهاء التجربة <X size={15} />
              </button>
            </div>
          )}
          <main id="main-content" className="main-content">
            {(!["settings", "sources"].includes(page) || profile) && (
              <section
                className="panel scope-panel"
                aria-label="نطاق السنة والفصل"
              >
                <div className="scope-controls">
                  <label>
                    السنة الأكاديمية
                    <select
                      aria-label="السنة الأكاديمية"
                      value={academicYear}
                      onChange={(e) => {
                        setAcademicYear(e.target.value);
                        setAcademicPeriod("");
                        setProfileId(null);
                      }}
                    >
                      {years.map((y) => (
                        <option value={y} key={y}>
                          {yearLabel(y)}هـ
                          {y === DEFAULT_ACADEMIC_YEAR ? " · الافتراضية" : ""}
                        </option>
                      ))}
                      <option value="all">جميع السنوات · السجل التاريخي</option>
                    </select>
                  </label>
                  {academicYear !== "all" && scope.periods.length > 0 && (
                    <label>
                      الفصل المرصود
                      <select
                        aria-label="الفصل المرصود"
                        value={scope.period}
                        onChange={(e) => {
                          setAcademicPeriod(e.target.value);
                          setProfileId(null);
                        }}
                      >
                        {scope.periods.map((p) => (
                          <option value={p} key={p}>
                            {semesterName(p)} · {number(Number(p))}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    البرنامج
                    <select
                      aria-label="تصفية البرنامج"
                      value={program}
                      onChange={(e) => setProgram(e.target.value)}
                    >
                      <option value="">جميع البرامج</option>
                      {[
                        ...new Set([
                          ...programs.map((p) => p.name),
                          ...workspace.students.map((s) => s.program),
                        ]),
                      ]
                        .sort((a, b) => a.localeCompare(b, "ar"))
                        .map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                    </select>
                  </label>
                  <label>
                    الدرجة
                    <select
                      aria-label="تصفية الدرجة"
                      value={degree}
                      onChange={(e) => setDegree(e.target.value)}
                    >
                      <option value="">جميع الدرجات</option>
                      <option>ماجستير</option>
                      <option>دكتوراه</option>
                    </select>
                  </label>
                  {(program || degree) && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setProgram("");
                        setDegree("");
                      }}
                    >
                      كل البرامج والدرجات
                    </button>
                  )}
                </div>
                <div className="scope-summary">
                  <strong>
                    {academicYear === "all"
                      ? "السجل التاريخي لجميع السنوات"
                      : `${yearLabel(academicYear)}هـ · ${scope.period ? semesterName(scope.period) : "لا يوجد كشف موثق"}`}
                  </strong>
                  <span>
                    {scope.sourceDate
                      ? `تاريخ استخراج الكشف: ${formatDate(scope.sourceDate)}`
                      : academicYear === "all"
                        ? "آخر رصد لكل قيد؛ تختلف سنواته"
                        : workspace.students.length
                          ? "لا يوجد كشف لهذا النطاق"
                          : "لم تُحمّل البيانات في هذا المتصفح"}
                  </span>
                </div>
                {academicYear === "1448" && scope.available && (
                  <small className="scope-caveat">
                    لقطة الفصل الأول أولية، وليست تعداد نهاية السنة.
                  </small>
                )}
                {!scope.available && academicYear !== "all" && (
                  <p className="alert">
                    {workspace.students.length
                      ? "لا توجد بيانات كشف لهذا النطاق؛ اختر سنة أو فصلًا آخر."
                      : "هذه مساحة متصفح خالية. البيانات المحفوظة في متصفح آخر لا تظهر تلقائيًا هنا."}
                    <button
                      className="text-button"
                      onClick={() => setImporting(true)}
                    >
                      فتح نسخة البيانات
                    </button>
                  </p>
                )}
              </section>
            )}
            {profile ? (
              <Profile
                key={profile.id}
                student={profile}
                observation={scope.students.find((s) => s.id === profile.id)}
                onBack={() => navigate("students")}
                onEdit={() => setEditor(profile)}
                onUpdate={saveStudent}
                onExport={() =>
                  setExporting([
                    scope.students.find((s) => s.id === profile.id) || profile,
                  ])
                }
                onPrint={() =>
                  print([
                    scope.students.find((s) => s.id === profile.id) || profile,
                  ])
                }
              />
            ) : (
              <>
                {page === "dashboard" && (
                  <ProgramSummary
                    students={population}
                    available={scope.available}
                    onProgram={(name, level) => {
                      setProgram(name);
                      setDegree(level);
                      navigate("students");
                    }}
                  />
                )}
                {page === "students" && (
                  <StudentDirectory
                    memory={directoryMemory}
                    students={population}
                    available={scope.available}
                    hasWorkspaceData={!!workspace.students.length}
                    onOpen={openProfile}
                    onExport={setExporting}
                    onPrint={print}
                    onImport={() => setImporting(true)}
                    onAdd={() => setEditor("new")}
                    onDelete={deleteStudent}
                    onResetScope={() => {
                      setProgram("");
                      setDegree("");
                    }}
                  />
                )}
                {page === "tasks" && (
                  <>
                    <div className="page-heading">
                      <div>
                        <span className="eyebrow">كل إجراء له موعد ومسؤول</span>
                        <h1>المهام والمواعيد</h1>
                        <p>
                          {number(openTasks.length)} مهمة مفتوحة ·{" "}
                          {number(lateTasks.length)} متأخرة عن موعدها
                        </p>
                      </div>
                    </div>
                    <section className="panel">
                      <div className="tasks-toolbar">
                        <div className="segmented">
                          {[
                            ["open", "المفتوحة"],
                            ["late", "المتأخرة"],
                            ["done", "المنجزة"],
                            ["all", "الكل"],
                          ].map(([id, label]) => (
                            <button
                              key={id}
                              className={taskFilter === id ? "active" : ""}
                              onClick={() => setTaskFilter(id)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <SearchBox
                          value={query}
                          onChange={setQuery}
                          placeholder="ابحث بالمهمة أو اسم الطالب…"
                        />
                      </div>
                      {allTasks
                        .filter(
                          (t) =>
                            (taskFilter === "all" ||
                              (taskFilter === "done" && t.done) ||
                              (taskFilter === "open" && !t.done) ||
                              (taskFilter === "late" && overdue(t))) &&
                            (!query ||
                              normalize(
                                t.title + " " + t.student.fullName,
                              ).includes(normalize(query))),
                        )
                        .map((t) => (
                          <div
                            className={`task-row ${t.done ? "done" : ""}`}
                            key={`${t.student.id}-${t.id}`}
                          >
                            <button
                              className={`task-check ${t.done ? "checked" : ""}`}
                              aria-label={
                                t.done ? "إعادة فتح المهمة" : "إنجاز المهمة"
                              }
                              onClick={async () => {
                                try {
                                  await saveStudent(
                                    {
                                      ...t.student,
                                      tasks: t.student.tasks.map((x) =>
                                        x.id === t.id
                                          ? { ...x, done: !x.done }
                                          : x,
                                      ),
                                      updatedAt: new Date().toISOString(),
                                    },
                                    t.done ? "إعادة فتح مهمة" : "إنجاز مهمة",
                                  );
                                } catch (e) {
                                  setToast(
                                    e instanceof Error
                                      ? e.message
                                      : "تعذر الحفظ",
                                  );
                                }
                              }}
                            >
                              {t.done && <Check size={14} />}
                            </button>
                            <div className="grow">
                              <strong>{t.title}</strong>
                              <button
                                className="task-student-link"
                                onClick={() => openProfile(t.student.id)}
                              >
                                {t.student.fullName} · {t.student.degree}{" "}
                                {t.student.program}
                              </button>
                            </div>
                            <span className="task-owner">
                              {t.owner || "المسؤول غير محدد"}
                            </span>
                            <div className="task-date">
                              <span>{formatDate(t.dueDate)}</span>
                              <Badge
                                tone={
                                  t.done
                                    ? "green"
                                    : overdue(t)
                                      ? "red"
                                      : "neutral"
                                }
                              >
                                {t.done
                                  ? "منجزة"
                                  : overdue(t)
                                    ? "متأخرة"
                                    : t.priority}
                              </Badge>
                            </div>
                            <button
                              className="icon-button"
                              aria-label="فتح ملف الطالب لإدارة المهمة"
                              onClick={() => openProfile(t.student.id)}
                            >
                              <ArrowUpLeft size={18} />
                            </button>
                          </div>
                        ))}
                      {!allTasks.some(
                        (t) =>
                          (taskFilter === "all" ||
                            (taskFilter === "done" && t.done) ||
                            (taskFilter === "open" && !t.done) ||
                            (taskFilter === "late" && overdue(t))) &&
                          (!query ||
                            normalize(
                              t.title + " " + t.student.fullName,
                            ).includes(normalize(query))),
                      ) && (
                        <Empty
                          title="لا توجد مهام في هذا النطاق"
                          description="أضف المهام من ملف الطالب، أو غيّر التصفية والبحث."
                        />
                      )}
                    </section>
                  </>
                )}
                {page === "reports" && (
                  <>
                    <div className="page-heading">
                      <div>
                        <span className="eyebrow">مخرجات تناسب طريقة عملك</span>
                        <h1>التقارير والتصدير</h1>
                        <p>
                          اختر النطاق والحقول، وراجع البيانات قبل استخراجها.
                        </p>
                      </div>
                    </div>
                    <div className="report-cards">
                      <section className="panel report-card">
                        <span className="report-icon">
                          <FileDown size={27} />
                        </span>
                        <h2>تقرير بيانات الطلاب</h2>
                        <p>
                          Excel متعدد الأوراق، أو CSV بحقول مخصصة، أو طباعة
                          ملفات الطلاب وحفظها PDF.
                        </p>
                        <button
                          className="button primary"
                          disabled={!population.length}
                          onClick={() => setExporting(population)}
                        >
                          تجهيز تقرير النطاق المعروض <ArrowLeft size={16} />
                        </button>
                        <button
                          className="text-button"
                          onClick={() => navigate("students")}
                        >
                          اختيار طلاب أو تصفية النطاق
                        </button>
                      </section>
                      <section className="panel report-card">
                        <span className="report-icon amber">
                          <FolderOpen size={27} />
                        </span>
                        <h2>تقرير استكمال الملفات</h2>
                        <p>
                          سجلات ينقصها تاريخ المصدر أو القبول أو القسم أو
                          الدفعة، والمشرف بعد مرحلة المقررات.
                        </p>
                        <strong className="report-number">
                          {number(incomplete.length)}{" "}
                          <small>ملفًا يحتاج استكمالًا</small>
                        </strong>
                        <button
                          className="button"
                          disabled={!incomplete.length}
                          onClick={() => setExporting(incomplete)}
                        >
                          تصدير ملفات الاستكمال <Download size={16} />
                        </button>
                      </section>
                      <section className="panel report-card">
                        <span className="report-icon blue">
                          <Database size={27} />
                        </span>
                        <h2>نسخة بيانات كاملة</h2>
                        <p>
                          ملف JSON يشمل الطلاب والسجلات المرتبطة، ويمكن إعادة
                          استيراده على جهاز آخر.
                        </p>
                        <button
                          className="button"
                          disabled={!workspace.students.length}
                          onClick={() => exportBackup(workspace)}
                        >
                          حفظ نسخة احتياطية <Download size={16} />
                        </button>
                      </section>
                    </div>
                    <div className="info-box">
                      <ShieldCheck size={20} />
                      <div>
                        <strong>التصدير يقرأ البيانات المسجلة في مساحتك</strong>
                        <p>
                          لا تستنتج حالة التخرج من غياب الطالب، ولا يحسب النظام
                          مددًا نظامية أو معدلًا جديدًا. التواريخ ميلادية ودفعة
                          القبول حقل نصي مستقل.
                        </p>
                      </div>
                    </div>
                  </>
                )}
                {page === "sources" && (
                  <>
                    <div className="page-heading">
                      <div>
                        <span className="eyebrow">نربط المعلومة بدليلها</span>
                        <h1>المصادر والربط</h1>
                        <p>
                          خريطة المراجع المرشحة لاستكمال بيانات جميع برامج
                          الدراسات العليا.
                        </p>
                      </div>
                      <Badge tone="amber">المزامنة الآلية لم تُفعّل</Badge>
                    </div>
                    <div className="info-box">
                      <LibraryBig size={21} />
                      <div>
                        <strong>المراجع جاهزة للوصول والمراجعة</strong>
                        <p>
                          الروابط التالية مراجع للمشروع. لا يجلب الموقع بياناتها
                          أو يدمجها تلقائيًا في ملف الطالب. كل ربط فردي يحتاج
                          معرفًا موثقًا ومصدرًا مؤرخًا.
                        </p>
                      </div>
                    </div>
                    <div className="source-grid">
                      {sources.map((source, i) => (
                        <section className="panel source-card" key={source.id}>
                          <div className="section-line">
                            <span className="source-number">0{i + 1}</span>
                            <Badge>{source.type}</Badge>
                          </div>
                          <h2>{source.title}</h2>
                          <p>{source.description}</p>
                          <div className="source-rule">{source.relation}</div>
                          <a
                            className="text-link"
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            فتح المرجع <ExternalLink size={15} />
                          </a>
                        </section>
                      ))}
                    </div>
                    <section className="panel program-catalog">
                      <div className="panel-heading">
                        <div>
                          <h3>دليل البرامج المبدئي</h3>
                          <p>
                            ستة برامج ماجستير وأربعة دكتوراه وفق README مستودع
                            الخطط، مراجعة 25 أكتوبر 2026. تعيين القسم اقتراح
                            قابل للتعديل عند الإدخال.
                          </p>
                        </div>
                        <GraduationCap size={23} />
                      </div>
                      <div className="program-chips">
                        {programs.map((p) => (
                          <span key={p.name + p.degree}>
                            {p.degree} {p.name}
                          </span>
                        ))}
                      </div>
                    </section>
                  </>
                )}
                {page === "settings" && (
                  <>
                    <div className="page-heading">
                      <div>
                        <span className="eyebrow">الحفظ والاستمرارية</span>
                        <h1>إعدادات المساحة</h1>
                        <p>
                          تعرف على مكان بياناتك، واحفظ نسخة منها قبل التحديثات
                          المهمة.
                        </p>
                      </div>
                    </div>
                    <div className="settings-grid">
                      <section className="panel">
                        <span className="settings-icon">
                          <ShieldCheck size={28} />
                        </span>
                        <h2>
                          {demo
                            ? "وضع التجربة الافتراضية"
                            : "مساحة محلية في هذا المتصفح"}
                        </h2>
                        <p>
                          الكود منشور على GitHub، والواجهة تعمل على Netlify.
                          بيانات الطلاب التي تدخلها تحفظ في IndexedDB على هذا
                          الجهاز، ولا يرسلها الموقع إلى خادم.
                        </p>
                        <div className="info-box">
                          حذف بيانات المتصفح أو الانتقال إلى جهاز أو عنوان موقع
                          مختلف لا ينقل السجلات معك. صدّر نسخة JSON واحفظها في
                          مكان مناسب ثم أعد استيرادها. الوصول إلى جهازك ومتصفحك
                          يتيح الوصول إلى هذه البيانات.
                        </div>
                        <div className="button-row">
                          <button
                            className="button primary"
                            onClick={() => exportBackup(workspace)}
                          >
                            <Download size={16} />
                            نسخة احتياطية
                          </button>
                          <button
                            className="button"
                            onClick={() => setImporting(true)}
                          >
                            <Upload size={16} />
                            استيراد بيانات
                          </button>
                        </div>
                      </section>
                      <section className="panel">
                        <h3>البدء وجمع البيانات</h3>
                        <p>
                          يمكنك استخدام قالب الأعمدة لإعداد أول دفعة. يلزم الرقم
                          الجامعي والاسم والبرنامج والدرجة، وباقي الحقول
                          اختيارية.
                        </p>
                        <button
                          className="button"
                          onClick={() =>
                            download(
                              new Blob(
                                [
                                  "\uFEFF" +
                                    columns
                                      .map(([, label]) => label)
                                      .join(",") +
                                    "\r\n",
                                ],
                                { type: "text/csv;charset=utf-8" },
                              ),
                              "قالب-بيانات-طلاب-الدراسات-العليا.csv",
                            )
                          }
                        >
                          <FileDown size={16} />
                          تنزيل قالب CSV فارغ
                        </button>
                        <hr />
                        <h3>استكشاف الواجهة</h3>
                        <p>
                          التجربة مستقلة عن بياناتك المحفوظة. أي تعديلات فيها
                          مؤقتة، والعودة للبيانات المحلية لا تدمجها.
                        </p>
                        <button
                          className="button"
                          onClick={demo ? leaveDemo : startDemo}
                        >
                          {demo ? (
                            <RotateCcw size={16} />
                          ) : (
                            <FlaskConical size={16} />
                          )}{" "}
                          {demo ? "العودة إلى بياناتي" : "فتح بيانات افتراضية"}
                        </button>
                      </section>
                    </div>
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h3>آخر العمليات في هذه المساحة</h3>
                          <p>
                            سجل محلي لآخر 200 عملية؛ لا يمثل سجل تدقيق مؤسسيًا
                            موثق الهوية.
                          </p>
                        </div>
                        <Clock3 size={20} />
                      </div>
                      {workspace.activity.length ? (
                        <div className="activity-list">
                          {workspace.activity.slice(0, 15).map((a) => (
                            <div key={a.id}>
                              <span className="live-dot" />
                              <strong>{a.action}</strong>
                              <small>{formatDate(a.at)}</small>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="muted">لا توجد عمليات مسجلة بعد.</p>
                      )}
                    </section>
                    <section className="panel next-stage">
                      <h3>المرحلة التالية: عمل مشترك بصلاحيات</h3>
                      <p>
                        قبل مشاركة السجلات الفعلية بين الموظفين: تسجيل دخول،
                        وصلاحيات بحسب البرنامج، وقاعدة بيانات خاصة خلف وظائف
                        Netlify، ونسخ احتياطي وسجل عمليات موثق. هذا الإصدار لا
                        يوفر مزامنة بين المستخدمين أو تسجيل دخول.
                      </p>
                      <a
                        className="text-link"
                        href="https://github.com/majed354/grad-tasks"
                        target="_blank"
                        rel="noreferrer"
                      >
                        مستودع المشروع <ExternalLink size={15} />
                      </a>
                    </section>
                  </>
                )}
              </>
            )}
            <footer className="app-footer">
              <span>
                مدار <i /> الدراسات العليا · كلية الشريعة والأنظمة
              </span>
              <span>
                إصدار التأسيس 0.1 <span className="live-dot" />
              </span>
            </footer>
          </main>
        </div>
      </div>
      {editor && (
        <StudentEditor
          student={editor === "new" ? undefined : editor}
          onSave={async (s) => {
            await saveStudent(s);
            if (!s.academicSnapshots.length) {
              setAcademicYear("all");
              setAcademicPeriod("");
              setProfileId(s.id);
            }
          }}
          onClose={() => setEditor(null)}
        />
      )}
      {importing && (
        <ImportDialog
          existing={workspace.students}
          onClose={() => setImporting(false)}
          onImport={async (students) => {
            await persist(
              (w) => {
                const byId = new Map(w.students.map((s) => [s.id, s]));
                students.forEach((s) => byId.set(s.id, s));
                return { ...w, students: [...byId.values()] };
              },
              `استيراد ${number(students.length)} سجلًا`,
            );
            clearFilters();
            navigate("students");
          }}
        />
      )}
      {exporting && (
        <ExportDialog
          context={scopeLabel}
          students={exporting}
          workspace={workspace}
          onClose={() => setExporting(null)}
          onPrint={print}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button onClick={() => setToast("")} aria-label="إغلاق الإشعار">
            <X size={15} />
          </button>
        </div>
      )}
      {printPreview && (
        <Modal
          title="معاينة ملفات الطلاب"
          subtitle={`${number(printStudents.length)} ملفًا كاملًا — راجع المحتوى قبل الطباعة`}
          onClose={() => setPrintPreview(false)}
          wide
        >
          <div className="print-preview">
            <PrintableStudents
              students={printStudents}
              demo={demo}
              context={scopeLabel}
            />
          </div>
          <footer className="modal-footer">
            <span>اختر حفظ PDF من نافذة طباعة المتصفح</span>
            <div className="button-row">
              <button className="button" onClick={() => setPrintPreview(false)}>
                إغلاق المعاينة
              </button>
              <button className="button primary" onClick={() => window.print()}>
                <FileDown size={16} />
                طباعة / حفظ PDF
              </button>
            </div>
          </footer>
        </Modal>
      )}
      <PrintableStudents
        students={printStudents}
        demo={demo}
        context={scopeLabel}
      />
    </>
  );
}
