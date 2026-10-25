import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrintableStudents } from "../src/Profile";
import { formatDate } from "../src/ui";
import {
  newStudent,
  studentKey,
  validateStudent,
  workspaceSchema,
  emptyWorkspace,
  digits,
  normalize,
} from "../src/model";
import {
  planImport,
  createWorkbook,
  csvText,
  readImport,
  guessMapping,
} from "../src/io";
import { loadWorkspace, saveWorkspace } from "../src/storage";
const student = () => ({
  ...newStudent(),
  studentNumber: "TEST-001",
  fullName: "طالب افتراضي",
  program: "الفقه",
  degree: "ماجستير" as const,
});
describe("هوية الطالب وجودة البيانات", () => {
  it("يعرض التاريخ بتوقيت الرياض حتى إن اختلف توقيت الجهاز", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "Asia/Riyadh";
      const expected = formatDate("2026-10-25");
      process.env.TZ = "Pacific/Honolulu";
      expect(formatDate("2026-10-25")).toBe(expected);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
  it("يطابق الأرقام العربية ويحفظ اختلاف الدرجة والبرنامج", () => {
    const s = student();
    expect(digits("١٢٣۴۵")).toBe("12345");
    expect(studentKey({ ...s, studentNumber: "١٢٣" })).toBe(
      studentKey({ ...s, studentNumber: "123" }),
    );
    expect(studentKey({ ...s, degree: "دكتوراه" })).not.toBe(studentKey(s));
    expect(normalize("أُصُول الفقه")).toBe("اصول الفقه");
  });
  it("يرفض التواريخ غير الموجودة والمعدل خارج مقياسه وروابط التنفيذ", () => {
    expect(() =>
      validateStudent({ ...student(), admissionDate: "2026-02-30" }),
    ).toThrow();
    expect(() =>
      validateStudent({ ...student(), gpa: 4.5, gpaScale: 4 }),
    ).toThrow();
    expect(() =>
      validateStudent({
        ...student(),
        documents: [
          {
            id: "doc",
            title: "وثيقة",
            date: "",
            type: "",
            url: "javascript:alert(1)",
            notes: "",
          },
        ],
      }),
    ).toThrow();
  });
  it("يرفض تكرار نفس القيد ويسمح للطالب بدرجة أخرى", () => {
    const s = student();
    expect(
      workspaceSchema.safeParse({
        ...emptyWorkspace(),
        students: [s, { ...s, id: "second" }],
      }).success,
    ).toBe(false);
    expect(
      workspaceSchema.safeParse({
        ...emptyWorkspace(),
        students: [s, { ...s, id: "second", degree: "دكتوراه" }],
      }).success,
    ).toBe(true);
  });
});
describe("مراجعة الاستيراد", () => {
  const headers = [
    "الرقم الجامعي",
    "اسم الطالب",
    "البرنامج",
    "الدرجة",
    "المشرف",
  ];
  const rows = [
    {
      "الرقم الجامعي": "TEST-001",
      "اسم الطالب": "اسم محدث افتراضي",
      البرنامج: "الفقه",
      الدرجة: "ماجستير",
      المشرف: "",
    },
  ];
  it("يتجاوز الموجود افتراضيًا ولا يمس المصدر", () => {
    const s = student();
    const plan = planImport(
      { headers, rows },
      guessMapping(headers),
      [s],
      false,
    );
    expect(plan.skipped).toBe(1);
    expect(plan.students).toHaveLength(0);
    expect(s.fullName).toBe("طالب افتراضي");
  });
  it("يحافظ على الحقول الفارغة والسجلات المرتبطة عند التحديث", () => {
    const s = {
      ...student(),
      supervisor: "مشرف تجريبي",
      tasks: [
        {
          id: "task",
          title: "متابعة",
          dueDate: "",
          owner: "",
          done: false,
          priority: "عادية" as const,
        },
      ],
    };
    const plan = planImport(
      { headers, rows },
      guessMapping(headers),
      [s],
      true,
    );
    expect(plan.errors).toHaveLength(0);
    expect(plan.updated).toBe(1);
    expect(plan.students[0].supervisor).toBe(s.supervisor);
    expect(plan.students[0].tasks).toEqual(s.tasks);
    expect(plan.students[0].fullName).toBe("اسم محدث افتراضي");
    expect(plan.students[0].id).toBe(s.id);
  });
  it("يرفض التكرار داخل الملف والصفوف الناقصة", () => {
    const plan = planImport(
      { headers, rows: [...rows, ...rows] },
      guessMapping(headers),
      [],
      true,
    );
    expect(plan.errors).toHaveLength(1);
    const noDegree = planImport(
      { headers, rows: [{ ...rows[0], الدرجة: "" }] },
      guessMapping(headers),
      [],
      false,
    );
    expect(noDegree.errors).toHaveLength(1);
  });
  it("يستعيد النسخة الكاملة دون تصادم المعرفات بين قيود مختلفة", () => {
    const s = student();
    const incoming = {
      ...s,
      program: "القانون",
      followUps: [{ id: "note", date: "2026-10-25", text: "ملاحظة افتراضية" }],
    };
    const plan = planImport(
      {
        headers: [],
        rows: [],
        backup: { ...emptyWorkspace(), students: [incoming] },
      },
      {},
      [s],
      true,
    );
    expect(plan.added).toBe(1);
    expect(plan.students[0].id).not.toBe(s.id);
    expect(plan.students[0].followUps).toEqual(incoming.followUps);
  });
});
describe("التصدير الحقيقي", () => {
  it("يحفظ العربية والفواصل والأسطر ويعطل صيغ CSV ولو سبقتها مسافات", () => {
    const s = {
      ...student(),
      fullName: "طالب، افتراضي",
      notes: "سطر أول\nسطر ثان",
      thesisTitle: ' =HYPERLINK("bad")',
    };
    const text = csvText(
      [s],
      ["studentNumber", "fullName", "notes", "thesisTitle"],
    );
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
    }).data;
    expect(parsed[0]["اسم الطالب"]).toBe(s.fullName);
    expect(parsed[0]["ملاحظات"]).toBe(s.notes);
    expect(parsed[0]["عنوان الرسالة"]).toBe("'" + s.thesisTitle);
    expect(text.startsWith("\uFEFF")).toBe(true);
  });
  it("ينشئ XLSX قابلاً للفتح وإعادة الاستيراد مع جميع الأوراق", async () => {
    const s = {
      ...student(),
      tasks: [
        {
          id: "task",
          title: "مهمة افتراضية",
          dueDate: "2026-11-01",
          owner: "المنسق",
          priority: "عالية" as const,
          done: false,
        },
      ],
    };
    const wb = await createWorkbook(
      [s],
      ["studentNumber", "fullName", "program", "degree"],
    );
    const bytes = await wb.xlsx.writeBuffer();
    const roundTrip = new ExcelJS.Workbook();
    await roundTrip.xlsx.load(bytes);
    expect(roundTrip.worksheets.map((x) => x.name)).toEqual([
      "الطلاب",
      "المهام",
      "المقررات",
      "القرارات",
      "الوثائق",
      "المتابعة",
      "عن التصدير",
    ]);
    expect(roundTrip.worksheets[0].getCell("A2").text).toBe("TEST-001");
    expect(roundTrip.getWorksheet("المهام")?.getCell("D2").text).toBe(
      "مهمة افتراضية",
    );
    const f = new File([bytes as BlobPart], "test.xlsx");
    const imported = await readImport(f);
    expect(
      planImport(imported, guessMapping(imported.headers), [], false).errors,
    ).toEqual([]);
  });
  it("يرفض صيغ Excel أثناء الإدخال بدل استخدام نتائج مخبأة", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Data");
    ws.addRow(["الرقم الجامعي"]);
    ws.addRow([{ formula: "1+1", result: 2 }]);
    const bytes = await wb.xlsx.writeBuffer();
    await expect(
      readImport(new File([bytes as BlobPart], "formula.xlsx")),
    ).rejects.toThrow("صيغ Excel");
  });
});
describe("حفظ المتصفح", () => {
  it("يجهز ملف طباعة كاملًا مع السجلات المرتبطة ومصدرها دون إخفاء التبويبات", () => {
    const s = {
      ...student(),
      courses: [
        {
          id: "c",
          code: "TEST-C",
          title: "مقرر اختبار الطباعة",
          semester: "481",
          credits: 3,
          grade: "أ",
          result: "مجتاز" as const,
        },
      ],
      documents: [
        {
          id: "d",
          title: "وثيقة اختبار الطباعة",
          type: "خطة",
          date: "2026-10-25",
          url: "https://example.org/test-document",
          notes: "",
        },
      ],
      followUps: [
        { id: "n", date: "2026-10-25", text: "متابعة اختبار الطباعة" },
      ],
    };
    const html = renderToStaticMarkup(
      createElement(PrintableStudents, { students: [s], demo: true }),
    );
    for (const value of [
      s.fullName,
      s.studentNumber,
      s.courses[0].title,
      s.documents[0].title,
      s.documents[0].url,
      s.followUps[0].text,
      "بيانات افتراضية للتجربة",
    ])
      expect(html).toContain(value);
  });
  it("يحفظ ويعيد البيانات ويرفض كتابة تبويب يحمل مراجعة قديمة", async () => {
    const initial = await loadWorkspace();
    const saved = await saveWorkspace(
      { ...initial, students: [student()] },
      initial.revision,
    );
    expect((await loadWorkspace()).students).toEqual(saved.students);
    await expect(
      saveWorkspace({ ...initial, students: [] }, initial.revision),
    ).rejects.toThrow("تبويب آخر");
    expect((await loadWorkspace()).students).toHaveLength(1);
  });
});
