import { describe, it, expect } from "vitest";
import { newStudent, studentSchema, emptyWorkspace } from "../src/model";
import type { Student, AcademicSnapshot } from "../src/model";
import {
  academicScope,
  availableYears,
  canonicalExportStudents,
  DEFAULT_ACADEMIC_YEAR,
  yearLabel,
} from "../src/academic";
import { readImport, planImport, createWorkbook } from "../src/io";
const evidence = {
  id: "ev",
  sourceId: "synthetic",
  kind: "كشف اختبار",
  url: "",
  locator: "HTML row 2",
  observedAt: "2026-10-25T10:00:00Z",
  fields: ["status"],
  rawDate: "2026-10-07",
  calendar: "ميلادي" as const,
  notes: "افتراضي",
  sourceName: "test.xls",
  sourcePath: "/synthetic/test.xls",
};
const snapshot = (
  period: string,
  sourceDate: string,
  status: AcademicSnapshot["status"] = "منتظم",
): AcademicSnapshot => ({
  id: period + sourceDate,
  academicYear: String(1400 + Number(period.slice(0, 2))),
  period,
  semester: period.at(-1) as AcademicSnapshot["semester"],
  sourceDate,
  status,
  stage: "غير موثق",
  department: "قسم افتراضي",
  gender: "ذكر",
  nationality: "",
  gpa: 4,
  gpaScale: null,
  admissionDateRaw: "2021-08-10",
  graduationDateRaw: "",
  expectedGraduationRaw: "",
  evidenceIds: ["ev"],
  notes: "",
});
const student = (id: string, snapshots: AcademicSnapshot[]): Student => ({
  ...newStudent(),
  id,
  studentNumber: "SYN-" + id,
  fullName: "طالب افتراضي " + id,
  program: "برنامج افتراضي",
  degree: "ماجستير",
  evidence: [evidence],
  academicSnapshots: snapshots,
  status: "متخرج",
  graduationDate: "2026-09-01",
});
describe("الرصد بحسب السنوات", () => {
  it("يجعل 1448 افتراضية ويحسب الفترة وتاريخ الاستخراج مع منع الحمل من نسخة قديمة", () => {
    const a = student("A", [
      snapshot("481", "2026-02-19", "متخرج"),
      snapshot("481", "2026-10-07"),
    ]);
    const b = student("B", [snapshot("481", "2026-02-19")]);
    const scope = academicScope([a, b], DEFAULT_ACADEMIC_YEAR);
    expect(scope.period).toBe("481");
    expect(yearLabel(DEFAULT_ACADEMIC_YEAR)).toBe("١٤٤٨");
    expect(scope.sourceDate).toBe("2026-10-07");
    expect(scope.students.map((x) => x.id)).toEqual(["A"]);
    expect(scope.students[0].status).toBe("منتظم");
    expect(scope.students[0].graduationDate).toBe("");
    expect(a.status).toBe("متخرج");
  });
  it("يفضل الفصل الثاني عند توفره ويترك الصيفي اختيارًا مستقلًا ولا يخترع سنوات غائبة", () => {
    const s = student("A", [
      snapshot("441", "2026-10-07"),
      snapshot("442", "2026-10-07"),
      snapshot("443", "2026-10-07"),
    ]);
    expect(academicScope([s], "1444").period).toBe("442");
    expect(academicScope([s], "1444", "443").period).toBe("443");
    expect(availableYears([s])).toEqual(["1448", "1444"]);
    expect(academicScope([s], "1448")).toMatchObject({
      available: false,
      students: [],
    });
    expect(academicScope([s], "all").students).toEqual([s]);
  });
  it("يرفض رصدًا مكررًا أو فصلًا مخالفًا للسنة أو دليلًا مفقودًا، ويقرأ النسخة القديمة", () => {
    const x = snapshot("481", "2026-10-07");
    const s = student("A", [x]);
    expect(
      studentSchema.safeParse({
        ...s,
        academicSnapshots: [x, { ...x, id: "different" }],
      }).success,
    ).toBe(false);
    expect(
      studentSchema.safeParse({
        ...s,
        academicSnapshots: [{ ...x, academicYear: "1447" }],
      }).success,
    ).toBe(false);
    expect(studentSchema.safeParse({ ...s, evidence: [] }).success).toBe(false);
    const { academicSnapshots: _, asOfPeriod: __, ...legacy } = s;
    expect(studentSchema.parse(legacy).academicSnapshots).toEqual([]);
  });
  it("يحفظ JSON الأصلي عند تصدير سنة قديمة ويعيد استيراد الرصد ومصادره دون تكرار", async () => {
    const original = student("A", [
      snapshot("471", "2026-02-19"),
      snapshot("481", "2026-10-07"),
    ]);
    const view = academicScope([original], "1447").students;
    expect(view[0].status).toBe("منتظم");
    const canonical = canonicalExportStudents([original], view);
    expect(canonical[0].status).toBe("متخرج");
    const body = JSON.stringify({ ...emptyWorkspace(), students: canonical });
    const file = new File([body], "synthetic.grad.json");
    const read = await readImport(file);
    const plan = planImport(read, {}, [], false);
    expect(plan.errors).toEqual([]);
    expect(plan.students[0].academicSnapshots).toEqual(
      original.academicSnapshots,
    );
    expect(planImport(read, {}, plan.students, false)).toMatchObject({
      added: 0,
      skipped: 1,
    });
    const large = {
      name: file.name,
      size: 24 * 1024 * 1024,
      text: () => file.text(),
    } as File;
    await expect(readImport(large)).resolves.toBeDefined();
    await expect(
      readImport({ ...large, name: "file.xlsx" } as File),
    ).rejects.toThrow("20");
  });
  it("يصدر ورقة الرصد ونطاق السنة ومسار الدليل المحلي إلى Excel", async () => {
    const s = student("A", [snapshot("481", "2026-10-07")]);
    const w = await createWorkbook(
      [s],
      ["studentNumber", "asOfPeriod"],
      "1448 · 481",
    );
    expect(w.worksheets).toHaveLength(10);
    expect(w.getWorksheet("الرصد الأكاديمي")?.getRow(2).values).toContain(
      "481",
    );
    expect(w.getWorksheet("المصادر")?.getRow(2).values).toContain(
      "/synthetic/test.xls",
    );
    expect(w.getWorksheet("عن التصدير")?.getRow(2).values).toContain(
      "1448 · 481",
    );
  });
});
