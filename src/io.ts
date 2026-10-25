import Papa from "papaparse";
import {
  newStudent,
  studentKey,
  validateStudent,
  workspaceSchema,
  digits,
  normalize,
} from "./model";
import type { Student, Workspace } from "./model";
export const columns = [
  ["studentNumber", "الرقم الجامعي"],
  ["fullName", "اسم الطالب"],
  ["program", "البرنامج"],
  ["degree", "الدرجة"],
  ["department", "القسم"],
  ["gender", "الجنس"],
  ["cohort", "دفعة القبول"],
  ["admissionDate", "تاريخ القبول"],
  ["status", "حالة القيد"],
  ["stage", "المرحلة"],
  ["asOfAcademicYear", "آخر سنة رصد"],
  ["supervisor", "المشرف"],
  ["coSupervisor", "المشرف المشارك"],
  ["thesisTitle", "عنوان الرسالة"],
  ["email", "البريد الإلكتروني"],
  ["phone", "الجوال"],
  ["nationality", "الجنسية"],
  ["gpa", "المعدل"],
  ["gpaScale", "مقياس المعدل"],
  ["completedCredits", "الساعات المجتازة"],
  ["requiredCredits", "الساعات المطلوبة"],
  ["proposalDate", "تاريخ اعتماد الخطة"],
  ["defenseDate", "تاريخ المناقشة"],
  ["graduationDate", "تاريخ التخرج"],
  ["expectedEndDate", "الموعد المستهدف للإنهاء"],
  ["source", "مصدر البيانات"],
  ["sourceDate", "تاريخ المصدر"],
  ["notes", "ملاحظات"],
] as const;
export type Column = (typeof columns)[number][0];
export const defaultColumns: Column[] = [
  "studentNumber",
  "fullName",
  "program",
  "degree",
  "cohort",
  "status",
  "stage",
  "supervisor",
];
export const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
export const safeCell = (v: unknown) =>
  typeof v === "string" && /^[\s\uFEFF]*[=+\-@]/.test(v) ? `'${v}` : (v ?? "");
export function exportRows(students: Student[], selected: Column[]) {
  return students.map((s) =>
    Object.fromEntries(
      columns
        .filter(([k]) => selected.includes(k))
        .map(([k, label]) => [label, s[k] ?? ""]),
    ),
  );
}
export function csvText(students: Student[], selected: Column[]) {
  return (
    "\uFEFF" +
    Papa.unparse(
      exportRows(students, selected).map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key, safeCell(value)]),
        ),
      ),
      { escapeFormulae: true },
    )
  );
}
export function exportCSV(students: Student[], selected: Column[]) {
  download(
    new Blob([csvText(students, selected)], { type: "text/csv;charset=utf-8" }),
    "طلاب-الدراسات-العليا.csv",
  );
}
export function exportBackup(
  workspace: Workspace,
  students = workspace.students,
) {
  const ids = new Set(students.map((s) => s.id));
  download(
    new Blob(
      [
        JSON.stringify(
          {
            format: "grad-tasks-backup",
            exportedAt: new Date().toISOString(),
            ...workspace,
            students,
            activity: workspace.activity.filter(
              (a) => !a.studentId || ids.has(a.studentId),
            ),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
    "نسخة-بيانات-الدراسات-العليا.grad.json",
  );
}
export async function createWorkbook(students: Student[], selected: Column[]) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "مدار — الدراسات العليا";
  wb.created = new Date();
  const add = (name: string, rows: Record<string, unknown>[]) => {
    const ws = wb.addWorksheet(name, {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
    });
    if (!rows.length) {
      ws.addRow(["لا توجد سجلات في هذا النطاق"]);
      return;
    }
    const keys = Object.keys(rows[0]);
    ws.columns = keys.map((k) => ({
      header: k,
      key: k,
      width: k.includes("عنوان") ? 50 : 25,
    }));
    for (const row of rows)
      ws.addRow(
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k, safeCell(v)]),
        ),
      );
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF183E3B" },
    };
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: keys.length },
    };
  };
  add("الطلاب", exportRows(students, selected));
  const related = (
    key:
      | "tasks"
      | "courses"
      | "decisions"
      | "documents"
      | "followUps"
      | "evidence"
      | "researchRecords",
    fields: [string, string][],
  ) =>
    students.flatMap((s) =>
      s[key].map((item) =>
        Object.fromEntries([
          ["الرقم الجامعي", s.studentNumber],
          ["البرنامج", s.program],
          ["الدرجة", s.degree],
          ...fields.map(([key, label]) => [
            label,
            Array.isArray((item as Record<string, unknown>)[key])
              ? ((item as Record<string, unknown>)[key] as string[]).join("؛ ")
              : (item as Record<string, unknown>)[key],
          ]),
        ]),
      ),
    );
  add(
    "المهام",
    related("tasks", [
      ["title", "المهمة"],
      ["dueDate", "الاستحقاق"],
      ["owner", "المسؤول"],
      ["priority", "الأولوية"],
      ["done", "منجزة"],
    ]),
  );
  add(
    "المقررات",
    related("courses", [
      ["code", "الرمز"],
      ["title", "المقرر"],
      ["semester", "الفصل"],
      ["credits", "الساعات"],
      ["grade", "التقدير"],
      ["result", "الحالة"],
    ]),
  );
  add(
    "القرارات",
    related("decisions", [
      ["title", "القرار"],
      ["number", "رقم القرار"],
      ["date", "التاريخ"],
      ["council", "المجلس"],
      ["page", "الصفحة"],
      ["url", "الرابط"],
      ["notes", "ملاحظات"],
    ]),
  );
  add(
    "الوثائق",
    related("documents", [
      ["title", "الوثيقة"],
      ["type", "النوع"],
      ["date", "التاريخ"],
      ["url", "الرابط"],
      ["notes", "ملاحظات"],
    ]),
  );
  add(
    "المتابعة",
    related("followUps", [
      ["date", "التاريخ"],
      ["text", "المتابعة"],
    ]),
  );
  add(
    "المصادر",
    related("evidence", [
      ["id", "معرف الدليل"],
      ["kind", "نوع الدليل"],
      ["sourceId", "معرف المصدر"],
      ["url", "الرابط"],
      ["locator", "الصف والصفحة"],
      ["rawDate", "التاريخ الأصلي"],
      ["calendar", "التقويم"],
      ["observedAt", "تاريخ الجمع"],
      ["fields", "الحقول المؤيدة"],
      ["notes", "ملاحظات"],
    ]),
  );
  add(
    "الرسائل",
    related("researchRecords", [
      ["id", "معرف الرسالة"],
      ["title", "عنوان الرسالة"],
      ["year", "سنة السجل"],
      ["status", "حالة الرسالة في المصدر"],
      ["supervisor", "المشرف"],
      ["supervisorId", "معرف المشرف"],
      ["coSupervisor", "المشارك"],
      ["coSupervisorId", "معرف المشارك"],
      ["examiner1", "المناقش الأول"],
      ["examiner1Id", "معرف المناقش الأول"],
      ["examiner2", "المناقش الثاني"],
      ["examiner2Id", "معرف المناقش الثاني"],
      ["defenseDateRaw", "تاريخ المناقشة الأصلي"],
      ["defenseCalendar", "التقويم"],
      ["verification", "حالة الربط"],
      ["evidenceIds", "معرفات الأدلة"],
    ]),
  );
  add("عن التصدير", [
    {
      "تاريخ التصدير": new Date().toISOString(),
      "عدد السجلات": students.length,
      النطاق: "الطلاب المحددون في معاينة التصدير",
      التواريخ:
        "الحقول الأساسية ميلادية؛ التواريخ الأصلية في الرسائل والمصادر تحمل تقويمها؛ دفعة القبول نص مستقل",
      تنبيه:
        "الحقول الفارغة غير متاحة؛ الساعات والمعدل مدخلات مصدرية ولا يعاد احتسابها.",
    },
  ]);
  return wb;
}
export async function exportExcel(students: Student[], selected: Column[]) {
  const wb = await createWorkbook(students, selected);
  const bytes = await wb.xlsx.writeBuffer();
  download(
    new Blob([bytes as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "طلاب-الدراسات-العليا.xlsx",
  );
}
export interface ImportFile {
  headers: string[];
  rows: Record<string, string>[];
  backup?: Workspace;
}
export async function readImport(file: File): Promise<ImportFile> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error(
      "الحد الأقصى للملف 20 ميجابايت. قسّم الملفات الكبيرة إلى دفعات.",
    );
  if (file.name.toLowerCase().endsWith(".json")) {
    const value = workspaceSchema.parse(JSON.parse(await file.text()));
    return { headers: [], rows: [], backup: value };
  }
  if (file.name.toLowerCase().endsWith(".csv")) {
    const parsed = Papa.parse<Record<string, string>>(await file.text(), {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
    });
    if (parsed.errors.length)
      throw new Error("تعذر قراءة CSV: " + parsed.errors[0].message);
    if (parsed.data.length > 20000) throw new Error("الحد الأقصى 20 ألف صف.");
    return { headers: parsed.meta.fields ?? [], rows: parsed.data };
  }
  if (!file.name.toLowerCase().endsWith(".xlsx"))
    throw new Error("اختر ملف CSV أو XLSX أو نسخة JSON من مدار.");
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("ملف Excel فارغ.");
  if (ws.rowCount > 20001) throw new Error("الحد الأقصى 20 ألف صف.");
  const cellText = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "object") {
      if ("formula" in v || "sharedFormula" in v)
        throw new Error("حوّل صيغ Excel إلى قيم قبل الاستيراد.");
      if ("richText" in v)
        return (v as { richText: { text: string }[] }).richText
          .map((x) => x.text)
          .join("");
      if ("text" in v) return String(v.text);
      return "";
    }
    return String(v);
  };
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => {
    headers[i - 1] = cellText(c.value).trim();
  });
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
    throw new Error("يجب أن تكون جميع عناوين الأعمدة غير فارغة وفريدة.");
  const rows: Record<string, string>[] = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const out: Record<string, string> = {};
    headers.forEach((h, n) => (out[h] = cellText(row.getCell(n + 1).value)));
    if (Object.values(out).some((v) => v.trim())) rows.push(out);
  });
  return { headers, rows };
}
export function guessMapping(
  headers: string[],
): Partial<Record<Column, string>> {
  const result: Partial<Record<Column, string>> = {};
  for (const [key, label] of columns) {
    const found = headers.find(
      (h) =>
        normalize(h) === normalize(label) || normalize(h) === normalize(key),
    );
    if (found) result[key] = found;
  }
  const aliases: Partial<Record<Column, string[]>> = {
    fullName: ["الاسم", "اسم الطالب/الطالبة", "student_name", "name"],
    studentNumber: [
      "الرقم الأكاديمي",
      "Student_ID",
      "student_id",
      "الرقم الجامعى",
    ],
    degree: ["الدرجة العلمية", "Degree_aName"],
    program: ["اسم البرنامج", "Major_aName"],
    status: ["الحالة", "الحالة الأكاديمية"],
  };
  for (const [k, values] of Object.entries(aliases))
    if (!result[k as Column]) {
      const h = headers.find((h) =>
        values.some((v) => normalize(v) === normalize(h)),
      );
      if (h) result[k as Column] = h;
    }
  return result;
}
export interface ImportPlan {
  students: Student[];
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
}
export function planImport(
  file: ImportFile,
  mapping: Partial<Record<Column, string>>,
  existing: Student[],
  update: boolean,
): ImportPlan {
  const result: ImportPlan = {
    students: [],
    added: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };
  const seen = new Set<string>();
  const rows = file.backup ? file.backup.students : file.rows;
  rows.forEach((row, i) => {
    try {
      let incoming: Student;
      let changes: Partial<Student> = {};
      if (file.backup) {
        incoming = validateStudent(row as Student);
        changes = incoming;
      } else {
        for (const [key, header] of Object.entries(mapping)) {
          const value = (row as Record<string, string>)[header!]?.trim();
          if (value) {
            if (
              [
                "gpa",
                "gpaScale",
                "completedCredits",
                "requiredCredits",
              ].includes(key)
            ) {
              (changes as Record<string, unknown>)[key] = Number(digits(value));
            } else
              (changes as Record<string, unknown>)[key] =
                key === "studentNumber" ? digits(value) : value;
          }
        }
        if ((changes.degree as string) === "الماجستير")
          changes.degree = "ماجستير";
        if (["الدكتوراه", "الدكتوراة"].includes(changes.degree as string))
          changes.degree = "دكتوراه";
        for (const key of [
          "studentNumber",
          "fullName",
          "program",
          "degree",
        ] as const)
          if (!changes[key])
            throw new Error(
              "يلزم الرقم الجامعي والاسم والبرنامج والدرجة لكل صف.",
            );
        incoming = {
          ...newStudent(),
          ...changes,
          source: changes.source || "استيراد ملف",
        };
      }
      const key = studentKey(incoming);
      if (seen.has(key))
        throw new Error("تكرار الرقم الجامعي والبرنامج والدرجة داخل الملف.");
      seen.add(key);
      const old = existing.find((s) => studentKey(s) === key);
      if (old && !update) {
        result.skipped++;
        return;
      }
      const candidate = old
        ? {
            ...old,
            ...changes,
            id: old.id,
            createdAt: old.createdAt,
            updatedAt: new Date().toISOString(),
          }
        : incoming;
      // Collision of a backup record ID must never overwrite another enrollment.
      if (!old && existing.some((s) => s.id === candidate.id))
        candidate.id = crypto.randomUUID();
      result.students.push(validateStudent(candidate));
      if (old) result.updated++;
      else result.added++;
    } catch (e) {
      result.errors.push(
        `الصف ${i + 2}: ${e instanceof Error ? e.message : "بيانات غير صحيحة"}`,
      );
    }
  });
  return result;
}
