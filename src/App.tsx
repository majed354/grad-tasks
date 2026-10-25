import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  FileDown,
  LibraryBig,
  Settings,
  GraduationCap,
  Plus,
  Upload,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUpLeft,
  Menu,
  X,
  ShieldCheck,
  FlaskConical,
  CalendarDays,
  Search,
  CircleHelp,
  Check,
  Trash2,
  FolderOpen,
  Clock3,
  BookOpen,
  ListFilter,
  ArrowLeft,
  Database,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { Badge, Empty, SearchBox, formatDate, number } from "./ui";
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
import { programs, statuses, stages, sources } from "./catalog";
import { exportBackup, columns, download } from "./io";
import { demoWorkspace } from "./demo";
import StudentEditor from "./StudentEditor";
import Profile, { PrintableStudents } from "./Profile";
import { ExportDialog, ImportDialog } from "./DataDialogs";
type Page =
  "dashboard" | "students" | "tasks" | "reports" | "sources" | "settings";
const navigation = [
  { id: "dashboard", label: "لوحة المتابعة", icon: LayoutDashboard },
  { id: "students", label: "سجل الطلاب", icon: Users },
  { id: "tasks", label: "المهام والمواعيد", icon: CheckSquare },
  { id: "reports", label: "التقارير والتصدير", icon: FileDown },
  { id: "sources", label: "المصادر والربط", icon: LibraryBig },
  { id: "settings", label: "إعدادات المساحة", icon: Settings },
] as const;
export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const current = useRef(workspace);
  const lock = useRef(false);
  const [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState(""),
    [demo, setDemo] = useState(false),
    [page, setPage] = useState<Page>("dashboard"),
    [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState(""),
    [degree, setDegree] = useState(""),
    [program, setProgram] = useState(""),
    [status, setStatus] = useState(""),
    [stage, setStage] = useState(""),
    [sort, setSort] = useState("updated"),
    [rowPage, setRowPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set()),
    [profileId, setProfileId] = useState<string | null>(null),
    [editor, setEditor] = useState<Student | "new" | null>(null),
    [importing, setImporting] = useState(false),
    [exporting, setExporting] = useState<Student[] | null>(null),
    [printStudents, setPrintStudents] = useState<Student[]>([]),
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
  useEffect(() => setRowPage(1), [query, degree, program, status, stage, sort]);
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
    setSelected(new Set());
    setProfileId(null);
    setPage("dashboard");
    setToast(
      "أنت الآن في بيانات افتراضية. التعديلات لن تحفظ بعد إغلاق التجربة.",
    );
  };
  const leaveDemo = async () => {
    try {
      accept(await loadWorkspace());
      setDemo(false);
      setProfileId(null);
      setSelected(new Set());
      setToast("عدت إلى بيانات هذا المتصفح");
    } catch {
      setToast("تعذر فتح البيانات المحلية. أعد المحاولة.");
    }
  };
  const filtered = useMemo(
    () =>
      workspace.students
        .filter(
          (s) =>
            (!degree || s.degree === degree) &&
            (!program || s.program === program) &&
            (!status || s.status === status) &&
            (!stage || s.stage === stage) &&
            (!query ||
              normalize(
                [
                  s.fullName,
                  s.studentNumber,
                  s.thesisTitle,
                  s.supervisor,
                  s.program,
                  s.department,
                ].join(" "),
              ).includes(normalize(query))),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.fullName.localeCompare(b.fullName, "ar")
            : sort === "number"
              ? a.studentNumber.localeCompare(b.studentNumber)
              : b.updatedAt.localeCompare(a.updatedAt),
        ),
    [workspace, degree, program, status, stage, query, sort],
  );
  const selectedStudents = workspace.students.filter((s) => selected.has(s.id));
  const profile = workspace.students.find((s) => s.id === profileId);
  const allTasks = workspace.students
    .flatMap((s) => s.tasks.map((t) => ({ ...t, student: s })))
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const openTasks = allTasks.filter((t) => !t.done);
  const lateTasks = allTasks.filter(overdue);
  const incomplete = workspace.students.filter((s) => missing(s).length);
  const openProfile = (id: string) => {
    setProfileId(id);
    setMobileNav(false);
    window.scrollTo({ top: 0 });
  };
  const print = useCallback((students: Student[]) => {
    setPrintStudents(students);
    setTimeout(() => window.print(), 100);
  }, []);
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
      setSelected((ids) => new Set([...ids].filter((id) => id !== s.id)));
    } catch (e) {
      setToast(e instanceof Error ? e.message : "تعذر الحذف");
    }
  };
  const clearFilters = () => {
    setQuery("");
    setDegree("");
    setProgram("");
    setStatus("");
    setStage("");
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
  const StudentName = ({ student: s }: { student: Student }) => (
    <button className="student-name" onClick={() => openProfile(s.id)}>
      <span className={`avatar ${s.gender === "أنثى" ? "rose" : ""}`}>
        {s.fullName
          .split(" ")
          .slice(0, 2)
          .map((x) => x[0])
          .join("")}
      </span>
      <span>
        <strong>{s.fullName}</strong>
        <small>
          <bdi>{s.studentNumber}</bdi>
        </small>
      </span>
    </button>
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
              navigate("dashboard");
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
                    {number(workspace.students.length)}
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
            {profile ? (
              <Profile
                key={profile.id}
                student={profile}
                onBack={() => navigate("students")}
                onEdit={() => setEditor(profile)}
                onUpdate={saveStudent}
                onExport={() => setExporting([profile])}
                onPrint={() => print([profile])}
              />
            ) : (
              <>
                {page === "dashboard" && (
                  <>
                    <div className="page-heading">
                      <div>
                        <span className="eyebrow">
                          متابعة أكاديمية، من القبول إلى التخرج
                        </span>
                        <h1>لوحة المتابعة</h1>
                        <p>صورة واضحة لطلابك، وما يحتاج إلى اهتمامك اليوم.</p>
                      </div>
                      <div className="button-row">
                        <button
                          className="button"
                          onClick={() => setImporting(true)}
                        >
                          <Upload size={17} />
                          استيراد بيانات
                        </button>
                        <button
                          className="button primary"
                          onClick={() => setEditor("new")}
                        >
                          <Plus size={18} />
                          إضافة طالب
                        </button>
                      </div>
                    </div>
                    <section className="hero-panel">
                      <div className="hero-copy">
                        <span className="hero-tag">
                          <span />{" "}
                          {demo
                            ? "استكشاف مساحة العمل"
                            : "مساحة عمل الدراسات العليا"}
                        </span>
                        <h2>
                          كل طالب،
                          <br />
                          <em>صورة مكتملة.</em>
                        </h2>
                        <p>
                          بياناته الأكاديمية، ورسالته، وقراراته ومواعيده؛
                          <br />
                          مترابطة في ملف واحد يسهل الرجوع إليه.
                        </p>
                        <button onClick={() => navigate("students")}>
                          استعرض سجل الطلاب <ArrowLeft size={18} />
                        </button>
                      </div>
                      <div className="hero-art" aria-hidden="true">
                        <div className="orbit orbit-one" />
                        <div className="orbit orbit-two" />
                        <div className="orbit orbit-three" />
                        <span className="orbit-dot dot-one" />
                        <span className="orbit-dot dot-two" />
                        <div className="art-card">
                          <span className="art-icon">
                            <GraduationCap size={40} />
                          </span>
                          <span className="art-line long" />
                          <span className="art-line" />
                          <div className="art-chips">
                            <i />
                            <i />
                            <i />
                          </div>
                          <div className="art-row">
                            <Check size={13} />
                            <span />
                          </div>
                          <div className="art-row">
                            <Check size={13} />
                            <span />
                          </div>
                        </div>
                        <span className="floating-label float-one">
                          <BookOpen size={15} />
                          مسار أكاديمي
                        </span>
                        <span className="floating-label float-two">
                          <CheckSquare size={15} />
                          متابعة متصلة
                        </span>
                      </div>
                    </section>
                    <div className="stats-grid">
                      {[
                        {
                          label: "إجمالي سجلات الطلاب",
                          value: workspace.students.length,
                          icon: Users,
                          sub: `${number(workspace.students.filter((s) => s.degree === "ماجستير").length)} ماجستير · ${number(workspace.students.filter((s) => s.degree === "دكتوراه").length)} دكتوراه`,
                          tone: "green",
                          click: () => navigate("students"),
                        },
                        {
                          label: "في مرحلة كتابة الرسالة",
                          value: workspace.students.filter(
                            (s) => s.stage === "كتابة الرسالة",
                          ).length,
                          icon: BookOpen,
                          sub: "حسب المرحلة المسجلة",
                          tone: "blue",
                          click: () => {
                            clearFilters();
                            setStage("كتابة الرسالة");
                            navigate("students");
                          },
                        },
                        {
                          label: "المهام المفتوحة",
                          value: openTasks.length,
                          icon: Clock3,
                          sub: `${number(lateTasks.length)} مهام تجاوزت موعدها`,
                          tone: "amber",
                          click: () => navigate("tasks"),
                        },
                        {
                          label: "ملفات تحتاج استكمالًا",
                          value: incomplete.length,
                          icon: FolderOpen,
                          sub: "تاريخ المصدر والقبول والبيانات الأساسية",
                          tone: "violet",
                          click: () => navigate("reports"),
                        },
                      ].map(
                        ({ label, value, icon: Icon, sub, tone, click }) => (
                          <button
                            className="stat-card"
                            key={label}
                            onClick={click}
                          >
                            <span className={`stat-icon ${tone}`}>
                              <Icon size={21} />
                            </span>
                            <span className="stat-label">{label}</span>
                            <strong>{number(value)}</strong>
                            <small>{sub}</small>
                            <ArrowUpLeft className="stat-arrow" size={16} />
                          </button>
                        ),
                      )}
                    </div>
                    {!workspace.students.length && (
                      <div className="onboarding">
                        <div>
                          <strong>لنبدأ بملف الطالب الأول</strong>
                          <p>
                            أضف طالبًا أو استورد كشفًا، أو استكشف الإمكانات
                            ببيانات افتراضية.
                          </p>
                        </div>
                        <button className="button" onClick={startDemo}>
                          <FlaskConical size={17} />
                          تجربة ببيانات افتراضية
                        </button>
                      </div>
                    )}
                    <div className="dashboard-grid">
                      <section className="panel">
                        <div className="panel-heading">
                          <div>
                            <h3>متابعة المواعيد</h3>
                            <p>المهام المفتوحة حسب أقرب تاريخ</p>
                          </div>
                          <button
                            className="text-button"
                            onClick={() => navigate("tasks")}
                          >
                            جميع المهام <ChevronLeft size={15} />
                          </button>
                        </div>
                        {openTasks.length ? (
                          <div className="dashboard-tasks">
                            {openTasks.slice(0, 4).map((t) => (
                              <button
                                className="dashboard-task"
                                key={`${t.student.id}-${t.id}`}
                                onClick={() => openProfile(t.student.id)}
                              >
                                <span
                                  className={`task-marker ${overdue(t) ? "overdue" : ""}`}
                                />
                                <div className="grow">
                                  <strong>{t.title}</strong>
                                  <small>
                                    {t.student.fullName} · {t.student.program}
                                  </small>
                                </div>
                                <div>
                                  <Badge tone={overdue(t) ? "red" : "neutral"}>
                                    {overdue(t) ? "متأخرة" : "مفتوحة"}
                                  </Badge>
                                  <small>{formatDate(t.dueDate)}</small>
                                </div>
                                <ChevronLeft size={16} />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <Empty
                            title="لا توجد مواعيد معلقة"
                            description="تظهر هنا المهام المفتوحة بعد إضافتها إلى ملفات الطلاب."
                          />
                        )}
                      </section>
                      <section className="panel">
                        <div className="panel-heading">
                          <div>
                            <h3>مراحل الطلاب</h3>
                            <p>توزيع السجلات على المسار الدراسي</p>
                          </div>
                          <GraduationCap size={21} />
                        </div>
                        <div className="stage-bars">
                          {stages.slice(0, 6).map((label, i) => {
                            const count = workspace.students.filter(
                              (s) => s.stage === label,
                            ).length;
                            return (
                              <button
                                key={label}
                                onClick={() => {
                                  clearFilters();
                                  setStage(label);
                                  navigate("students");
                                }}
                              >
                                <div>
                                  <span>
                                    <i className={`stage-dot stage-${i}`} />
                                    {label}
                                  </span>
                                  <strong>{number(count)}</strong>
                                </div>
                                <span className="bar-track">
                                  <span
                                    style={{
                                      width: `${workspace.students.length ? (count / workspace.students.length) * 100 : 0}%`,
                                    }}
                                  />
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <small className="muted">
                          المتخرجون:{" "}
                          {number(
                            workspace.students.filter(
                              (s) => s.stage === "متخرج",
                            ).length,
                          )}{" "}
                          · عرض لحالة السجل الحالية
                        </small>
                      </section>
                    </div>
                    <section className="panel recent-panel">
                      <div className="panel-heading">
                        <div>
                          <h3>آخر ملفات الطلاب تحديثًا</h3>
                          <p>الوصول السريع إلى التفاصيل والسجلات المرتبطة</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => navigate("students")}
                        >
                          عرض السجل <ChevronLeft size={15} />
                        </button>
                      </div>
                      {workspace.students.length ? (
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>الطالب</th>
                                <th>البرنامج</th>
                                <th>المرحلة</th>
                                <th>المشرف</th>
                                <th>الحالة</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {[...workspace.students]
                                .sort((a, b) =>
                                  b.updatedAt.localeCompare(a.updatedAt),
                                )
                                .slice(0, 5)
                                .map((s) => (
                                  <tr key={s.id}>
                                    <td>
                                      <StudentName student={s} />
                                    </td>
                                    <td>
                                      <strong>{s.program}</strong>
                                      <small>{s.degree}</small>
                                    </td>
                                    <td>{s.stage}</td>
                                    <td>{s.supervisor || "لم يسجل"}</td>
                                    <td>
                                      <Badge
                                        tone={
                                          s.status === "منتظم"
                                            ? "green"
                                            : "amber"
                                        }
                                      >
                                        {s.status}
                                      </Badge>
                                    </td>
                                    <td>
                                      <button
                                        className="icon-button"
                                        aria-label={`فتح ملف ${s.fullName}`}
                                        onClick={() => openProfile(s.id)}
                                      >
                                        <ArrowUpLeft size={19} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <Empty
                          title="ملفات طلابك تبدأ من هنا"
                          description="بعد إدخال البيانات ستظهر أحدث الملفات تلقائيًا."
                        />
                      )}
                    </section>
                  </>
                )}
                {page === "students" && (
                  <>
                    <div className="page-heading">
                      <div>
                        <span className="eyebrow">
                          دليل موحد لجميع برامج الدراسات العليا
                        </span>
                        <h1>
                          سجل الطلاب{" "}
                          <span className="heading-count">
                            {number(workspace.students.length)}
                          </span>
                        </h1>
                        <p>ابحث، صفِّ النتائج، وافتح ملف الطالب بكل تفاصيله.</p>
                      </div>
                      <div className="button-row">
                        <button
                          className="button"
                          onClick={() => setImporting(true)}
                        >
                          <Upload size={16} />
                          استيراد
                        </button>
                        <button
                          className="button primary"
                          onClick={() => setEditor("new")}
                        >
                          <Plus size={17} />
                          إضافة طالب
                        </button>
                      </div>
                    </div>
                    <section className="panel directory-panel">
                      <div className="directory-tools">
                        <SearchBox value={query} onChange={setQuery} />
                        <button
                          className="button"
                          disabled={
                            !filtered.length && !selectedStudents.length
                          }
                          onClick={() =>
                            setExporting(
                              selectedStudents.length
                                ? selectedStudents
                                : filtered,
                            )
                          }
                        >
                          <Download size={16} />
                          {selectedStudents.length
                            ? `تصدير المحدد (${number(selectedStudents.length)})`
                            : "تصدير النتائج"}
                        </button>
                      </div>
                      <div className="filter-bar">
                        <span>
                          <ListFilter size={16} />
                          تصفية
                        </span>
                        <select
                          aria-label="تصفية الدرجة"
                          value={degree}
                          onChange={(e) => setDegree(e.target.value)}
                        >
                          <option value="">كل الدرجات</option>
                          <option>ماجستير</option>
                          <option>دكتوراه</option>
                        </select>
                        <select
                          aria-label="تصفية البرنامج"
                          value={program}
                          onChange={(e) => setProgram(e.target.value)}
                        >
                          <option value="">كل البرامج</option>
                          {[
                            ...new Set([
                              ...programs.map((p) => p.name),
                              ...workspace.students.map((s) => s.program),
                            ]),
                          ].map((p) => (
                            <option key={p}>{p}</option>
                          ))}
                        </select>
                        <select
                          aria-label="تصفية حالة القيد"
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                        >
                          <option value="">كل الحالات</option>
                          {statuses.map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                        <select
                          aria-label="تصفية المرحلة"
                          value={stage}
                          onChange={(e) => setStage(e.target.value)}
                        >
                          <option value="">كل المراحل</option>
                          {stages.map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                        {(degree || program || status || stage || query) && (
                          <button
                            className="text-button"
                            onClick={clearFilters}
                          >
                            مسح الفلاتر
                          </button>
                        )}
                        <select
                          className="sort-select"
                          aria-label="ترتيب الطلاب"
                          value={sort}
                          onChange={(e) => setSort(e.target.value)}
                        >
                          <option value="updated">الأحدث تعديلًا</option>
                          <option value="name">الاسم أبجديًا</option>
                          <option value="number">الرقم الجامعي</option>
                        </select>
                      </div>
                      {!!selected.size && (
                        <div className="selection-bar">
                          تم تحديد {number(selected.size)} سجلًا (قد تشمل نتائج
                          خارج الفلاتر)
                          <button
                            className="text-button"
                            onClick={() => setSelected(new Set())}
                          >
                            إلغاء التحديد
                          </button>
                        </div>
                      )}
                      {filtered.length ? (
                        <>
                          <div className="table-wrap">
                            <table className="student-table">
                              <thead>
                                <tr>
                                  <th>
                                    <input
                                      type="checkbox"
                                      aria-label="تحديد كل نتائج البحث"
                                      checked={
                                        !!filtered.length &&
                                        filtered.every((s) =>
                                          selected.has(s.id),
                                        )
                                      }
                                      onChange={(e) =>
                                        setSelected((v) => {
                                          const next = new Set(v);
                                          filtered.forEach((s) =>
                                            e.target.checked
                                              ? next.add(s.id)
                                              : next.delete(s.id),
                                          );
                                          return next;
                                        })
                                      }
                                    />
                                  </th>
                                  <th>الطالب</th>
                                  <th>البرنامج / الدرجة</th>
                                  <th>الدفعة</th>
                                  <th>المرحلة الحالية</th>
                                  <th>المشرف</th>
                                  <th>حالة القيد</th>
                                  <th>إجراءات</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filtered
                                  .slice((rowPage - 1) * 10, rowPage * 10)
                                  .map((s) => (
                                    <tr
                                      key={s.id}
                                      className={
                                        selected.has(s.id) ? "selected" : ""
                                      }
                                    >
                                      <td>
                                        <input
                                          type="checkbox"
                                          aria-label={`تحديد ${s.fullName}`}
                                          checked={selected.has(s.id)}
                                          onChange={(e) =>
                                            setSelected((v) => {
                                              const n = new Set(v);
                                              e.target.checked
                                                ? n.add(s.id)
                                                : n.delete(s.id);
                                              return n;
                                            })
                                          }
                                        />
                                      </td>
                                      <td>
                                        <StudentName student={s} />
                                      </td>
                                      <td>
                                        <strong>{s.program}</strong>
                                        <small>{s.degree}</small>
                                      </td>
                                      <td>{s.cohort || "—"}</td>
                                      <td>{s.stage}</td>
                                      <td>{s.supervisor || "لم يسجل"}</td>
                                      <td>
                                        <Badge
                                          tone={
                                            s.status === "منتظم"
                                              ? "green"
                                              : s.status === "متخرج"
                                                ? "blue"
                                                : "amber"
                                          }
                                        >
                                          {s.status}
                                        </Badge>
                                      </td>
                                      <td>
                                        <div className="record-controls">
                                          <button
                                            className="icon-button"
                                            aria-label={`فتح ملف ${s.fullName}`}
                                            onClick={() => openProfile(s.id)}
                                          >
                                            <ArrowUpLeft size={18} />
                                          </button>
                                          <button
                                            className="icon-button danger"
                                            aria-label={`حذف ملف ${s.fullName}`}
                                            onClick={() => deleteStudent(s)}
                                          >
                                            <Trash2 size={15} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="table-footer">
                            <span>
                              عرض {number((rowPage - 1) * 10 + 1)}–
                              {number(Math.min(rowPage * 10, filtered.length))}{" "}
                              من {number(filtered.length)} سجلًا
                            </span>
                            <div className="button-row">
                              <button
                                className="icon-button"
                                aria-label="الصفحة السابقة"
                                disabled={rowPage <= 1}
                                onClick={() => setRowPage((p) => p - 1)}
                              >
                                <ChevronRight size={18} />
                              </button>
                              <span>
                                {number(rowPage)} /{" "}
                                {number(Math.ceil(filtered.length / 10))}
                              </span>
                              <button
                                className="icon-button"
                                aria-label="الصفحة التالية"
                                disabled={rowPage * 10 >= filtered.length}
                                onClick={() => setRowPage((p) => p + 1)}
                              >
                                <ChevronLeft size={18} />
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <Empty
                          title={
                            workspace.students.length
                              ? "لا توجد نتائج مطابقة"
                              : "سجل الطلاب جاهز للبدء"
                          }
                          description={
                            workspace.students.length
                              ? "جرّب تغيير كلمات البحث أو مسح الفلاتر."
                              : "أضف طالبًا أو استورد كشف Excel أو CSV للبدء."
                          }
                          action={
                            <button
                              className="button"
                              onClick={
                                workspace.students.length
                                  ? clearFilters
                                  : () => setEditor("new")
                              }
                            >
                              {workspace.students.length
                                ? "مسح البحث والفلاتر"
                                : "إضافة طالب"}
                            </button>
                          }
                        />
                      )}
                    </section>
                  </>
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
                          disabled={!workspace.students.length}
                          onClick={() => setExporting(workspace.students)}
                        >
                          تجهيز تقرير جميع الطلاب <ArrowLeft size={16} />
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
          onSave={(s) => saveStudent(s)}
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
      <PrintableStudents students={printStudents} demo={demo} />
    </>
  );
}
