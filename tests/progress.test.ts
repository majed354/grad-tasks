import { describe, it, expect } from "vitest";
import { newStudent } from "../src/model";
import {
  admissionYear,
  courseResult,
  expectedLevel,
  filterDirectory,
  filterPopulation,
  LEVEL_METHOD,
  levelLabel,
  progressGroup,
} from "../src/progress";
import { createWorkbook, exportRows, planImport, readImport } from "../src/io";
const example = () => ({
  ...newStudent(),
  studentNumber: "SYN-1001",
  fullName: "طالب افتراضي",
  program: "برنامج تجريبي",
  degree: "ماجستير" as const,
  status: "منتظم" as const,
  admissionDate: "2026-08-20",
  asOfAcademicYear: "1448",
  asOfPeriod: "481",
  sourceDate: "2026-10-07",
});
describe("الحالة والمستوى المتوقع", () => {
  it("يفصل الحالات المثبتة ولا يستنتج التخرج من غياب الرصد أو اكتمال الرسالة", () => {
    const s = example();
    s.graduationDate = "2026-01-01";
    s.thesisTitle = "رسالة مكتملة افتراضية";
    expect(progressGroup(s)).toBe("continuing");
    expect(progressGroup({ ...s, status: "متخرج" })).toBe("graduated");
    expect(progressGroup({ ...s, status: "مفصول أكاديميًا" })).toBe(
      "dismissed",
    );
    expect(progressGroup({ ...s, status: "مطوي القيد" })).toBe("closed");
    expect(progressGroup({ ...s, status: "غير موثق" })).toBe("unknown");
  });
  it("يحسب المستوى الزمني من تاريخ القبول وفصل الرصد ويصرح بالتقدير", () => {
    const s = example();
    expect(expectedLevel(s)?.value).toBe(1);
    expect(expectedLevel({ ...s, asOfPeriod: "482" })?.value).toBe(2);
    expect(expectedLevel({ ...s, asOfPeriod: "483" })?.value).toBe(2);
    expect(expectedLevel({ ...s, admissionDate: "2025-08-20" })?.value).toBe(3);
    expect(
      expectedLevel({
        ...s,
        admissionDate: "2026-01-20",
        admissionPeriod: "472",
      })?.value,
    ).toBe(2);
    expect(
      expectedLevel({ ...s, admissionDate: "2026-01-20", cohort: "1448" })
        ?.value,
    ).toBe(1);
    expect(expectedLevel({ ...s, status: "مؤجل" })?.method).toContain(
      "لا يخصم",
    );
    expect(levelLabel(s)).toContain("تقديري");
  });
  it("يرفض التواريخ غير الصحيحة والمستويات قبل القبول أو بعد نهاية القيد", () => {
    const s = example();
    for (const x of [
      { admissionDate: "" },
      { admissionDate: "2026-02-30" },
      { admissionDate: "2027-08-01" },
      { asOfPeriod: "" },
      { asOfPeriod: "471" },
      { status: "متخرج" as const },
      { status: "منسحب" as const },
      { status: "مفصول أكاديميًا" as const },
    ])
      expect(expectedLevel({ ...s, ...x })).toBeNull();
    expect(admissionYear("2026-07-01")).toBe(1448);
    expect(admissionYear("2026-06-30")).toBe(1448);
  });
  it("يطابق البرنامج والدرجة والحالة والبحث العربي والمستوى معًا دون تغيير البيانات", () => {
    const a = example(),
      b = { ...example(), id: "B", degree: "دكتوراه" as const },
      c = { ...example(), id: "C", status: "منسحب" as const };
    const rows = [a, b, c];
    const original = JSON.stringify(rows);
    const scoped = filterPopulation(rows, "برنامج تجريبي", "ماجستير");
    expect(scoped.map((s) => s.id)).toEqual([a.id, c.id]);
    expect(
      filterDirectory(scoped, {
        query: "١٠٠١",
        group: "continuing",
        level: "1",
      }),
    ).toEqual([a]);
    expect(filterDirectory(scoped, { group: "withdrawn" })).toEqual([c]);
    expect(filterPopulation(rows)).toHaveLength(3);
    expect(JSON.stringify(rows)).toBe(original);
  });
  it("لا يحول غياب المقررات أو المعدل المنخفض إلى رسوب", () => {
    const s = { ...example(), gpa: 0 };
    expect(courseResult(s)).toContain("لم يرفق");
    expect(filterDirectory([s], { failed: true })).toEqual([]);
    s.courses = [
      {
        id: "synthetic-course",
        code: "SYN",
        title: "مقرر افتراضي",
        semester: "481",
        credits: 3,
        grade: "F",
        result: "غير مجتاز",
      },
    ];
    expect(filterDirectory([s], { failed: true })).toEqual([s]);
  });
  it("يحفظ فصل التقدير ومنهجه في Excel وCSV ولا يستورد التقدير كبيان رسمي", async () => {
    const s = example();
    const selected = [
      "studentNumber",
      "fullName",
      "program",
      "degree",
      "expectedLevel",
      "levelMethod",
    ] as const;
    const rows = exportRows([s], [...selected]);
    expect(rows[0]["المستوى المتوقع زمنيًا (تقديري)"]).toContain("١");
    expect(rows[0]["أساس تقدير المستوى"]).toBe(expectedLevel(s)!.method);
    const workbook = await createWorkbook([s], [...selected], "1448 · 481");
    expect(workbook.worksheets).toHaveLength(11);
    expect(workbook.getWorksheet("الطلاب")!.getRow(2).values).toContain(
      expectedLevel(s)!.method,
    );
    const { csvText } = await import("../src/io");
    const data = await readImport(
      new File([csvText([s], [...selected])], "synthetic.csv"),
    );
    const plan = planImport(
      data,
      {
        studentNumber: "الرقم الجامعي",
        fullName: "اسم الطالب",
        program: "البرنامج",
        degree: "الدرجة",
      },
      [],
      false,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.students[0]).not.toHaveProperty("expectedLevel");
    expect(plan.students[0].stage).toBe("غير موثق");
  });
});
