import { z } from "zod";
import { degrees, statuses, stages } from "./catalog";

const text = z.string().max(10000);
const date = z
  .string()
  .refine(
    (v) =>
      !v ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v),
    "التاريخ غير صحيح؛ استخدم YYYY-MM-DD",
  );
const url = z
  .string()
  .max(2000)
  .refine(
    (v) =>
      !v ||
      (/^https?:\/\//i.test(v) &&
        (() => {
          try {
            return !!new URL(v).hostname;
          } catch {
            return false;
          }
        })()),
    "استخدم رابط http أو https صحيحًا",
  );
export const taskSchema = z.object({
  id: z.string(),
  title: text.min(1),
  dueDate: date,
  owner: text,
  priority: z.enum(["عادية", "عالية"]),
  done: z.boolean(),
});
export const courseSchema = z.object({
  id: z.string(),
  code: text,
  title: text.min(1),
  semester: text,
  credits: z.number().min(0).max(100).nullable(),
  grade: text,
  result: z.enum(["مسجل", "مجتاز", "غير مجتاز", "معادل"]),
});
export const decisionSchema = z.object({
  id: z.string(),
  title: text.min(1),
  number: text,
  date,
  council: text,
  page: text,
  url,
  notes: text,
});
export const documentSchema = z.object({
  id: z.string(),
  title: text.min(1),
  type: text,
  date,
  url: url.refine((v) => !!v, "الرابط مطلوب"),
  notes: text,
});
export const noteSchema = z.object({ id: z.string(), date, text: text.min(1) });
export const studentSchema = z
  .object({
    id: z.string().min(1),
    studentNumber: z
      .string()
      .regex(
        /^[A-Za-z0-9-]{3,30}$/,
        "أدخل رقمًا جامعيًا من 3 إلى 30 حرفًا أو رقمًا",
      ),
    fullName: text.min(2, "الاسم مطلوب"),
    program: text.min(1, "البرنامج مطلوب"),
    degree: z.enum(degrees),
    department: text,
    gender: z.enum(["ذكر", "أنثى", "غير محدد"]),
    cohort: text,
    admissionDate: date,
    status: z.enum(statuses),
    stage: z.enum(stages),
    email: z
      .string()
      .max(200)
      .refine(
        (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        "البريد غير صحيح",
      ),
    phone: text,
    nationality: text,
    gpa: z.number().min(0).max(5).nullable(),
    gpaScale: z.union([z.literal(4), z.literal(5)]),
    completedCredits: z.number().min(0).max(1000).nullable(),
    requiredCredits: z.number().min(0).max(1000).nullable(),
    supervisor: text,
    coSupervisor: text,
    thesisTitle: text,
    proposalDate: date,
    defenseDate: date,
    graduationDate: date,
    expectedEndDate: date,
    source: text,
    sourceDate: date,
    notes: text,
    tasks: z.array(taskSchema).max(500),
    courses: z.array(courseSchema).max(500),
    decisions: z.array(decisionSchema).max(500),
    documents: z.array(documentSchema).max(500),
    followUps: z.array(noteSchema).max(500),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((s, c) => {
    for (const key of [
      "tasks",
      "courses",
      "decisions",
      "documents",
      "followUps",
    ] as const) {
      const ids = new Set<string>();
      s[key].forEach((item, index) => {
        if (!item.id || ids.has(item.id))
          c.addIssue({
            code: "custom",
            path: [key, index, "id"],
            message: "معرف سجل مرتبط مفقود أو مكرر",
          });
        ids.add(item.id);
      });
    }
    if (s.gpa !== null && s.gpa > s.gpaScale)
      c.addIssue({
        code: "custom",
        path: ["gpa"],
        message: "المعدل يتجاوز مقياسه",
      });
  });
export type Student = z.infer<typeof studentSchema>;
export type Task = z.infer<typeof taskSchema>;
export const workspaceSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    students: z.array(studentSchema).max(20000),
    activity: z
      .array(
        z.object({
          id: z.string(),
          at: z.string().datetime(),
          action: text,
          studentId: z.string(),
        }),
      )
      .max(200),
  })
  .superRefine((w, c) => {
    const ids = new Set<string>(),
      keys = new Set<string>();
    w.students.forEach((s, i) => {
      const key = studentKey(s);
      if (ids.has(s.id) || keys.has(key))
        c.addIssue({
          code: "custom",
          path: ["students", i],
          message:
            "رقم جامعي مكرر في البرنامج والدرجة نفسيهما أو معرف سجل مكرر",
        });
      ids.add(s.id);
      keys.add(key);
    });
  });
export type Workspace = z.infer<typeof workspaceSchema>;
export const emptyWorkspace = (): Workspace => ({
  schemaVersion: 1,
  revision: 0,
  students: [],
  activity: [],
});
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const digits = (v: string) =>
  v
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)));
export const normalize = (v: string) =>
  digits(v)
    .replace(/[\u064B-\u065F\u0670ـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
export const studentKey = (
  s: Pick<Student, "studentNumber" | "program" | "degree">,
) =>
  `${digits(s.studentNumber).trim().toLowerCase()}|${normalize(s.program)}|${s.degree}`;
export const overdue = (task: Task) =>
  !task.done && !!task.dueDate && task.dueDate < today();
export const missing = (s: Student) =>
  [
    !s.cohort && "دفعة القبول",
    !s.admissionDate && "تاريخ القبول",
    !s.sourceDate && "تاريخ المصدر",
    !s.department && "القسم",
    !s.supervisor && s.stage !== "المقررات" && "المشرف",
  ].filter(Boolean) as string[];
export function newStudent(): Student {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    studentNumber: "",
    fullName: "",
    program: "",
    degree: "ماجستير",
    department: "",
    gender: "غير محدد",
    cohort: "",
    admissionDate: "",
    status: "منتظم",
    stage: "المقررات",
    email: "",
    phone: "",
    nationality: "",
    gpa: null,
    gpaScale: 5,
    completedCredits: null,
    requiredCredits: null,
    supervisor: "",
    coSupervisor: "",
    thesisTitle: "",
    proposalDate: "",
    defenseDate: "",
    graduationDate: "",
    expectedEndDate: "",
    source: "إدخال يدوي",
    sourceDate: "",
    notes: "",
    tasks: [],
    courses: [],
    decisions: [],
    documents: [],
    followUps: [],
    createdAt: now,
    updatedAt: now,
  };
}
export function validateStudent(s: Student) {
  const r = studentSchema.safeParse(s);
  if (!r.success)
    throw new Error(
      r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("؛ "),
    );
  return r.data;
}
