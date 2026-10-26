import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseResults } from "../src/CourseResults";
import { newStudent, studentSchema, emptyWorkspace } from "../src/model";
import {
  resultConflict,
  historicalResults,
  resultExportRows,
} from "../src/results";
import { expectedLevel, filterDirectory, progressGroup } from "../src/progress";
import { backupText, createWorkbook, planImport, readImport } from "../src/io";
const sample = () =>
  studentSchema.parse({
    ...newStudent(),
    studentNumber: "SYN-RESULT",
    fullName: "طالب افتراضي",
    program: "برنامج افتراضي",
    admissionDate: "2026-06-01",
    asOfAcademicYear: "1448",
    asOfPeriod: "481",
    sourceDate: "2026-10-07",
    evidence: [
      {
        id: "ev",
        sourceId: "sha:synthetic",
        kind: "نتائج",
        sourceName: "synthetic.xls",
        sourcePath: "/synthetic/results.xls",
        url: "",
        locator: "جدول",
        observedAt: "2026-10-26T10:00:00Z",
        fields: ["courseResults"],
        rawDate: "",
        calendar: "غير محدد",
        notes: "SHA-256: synthetic",
      },
    ],
    academicSnapshots: [
      {
        id: "snap",
        academicYear: "1448",
        period: "481",
        semester: "1",
        sourceDate: "2026-10-07",
        status: "منتظم",
        stage: "غير موثق",
        department: "",
        gender: "غير محدد",
        nationality: "",
        gpa: null,
        gpaScale: null,
        admissionDateRaw: "2026-06-01",
        graduationDateRaw: "",
        expectedGraduationRaw: "",
        evidenceIds: ["ev"],
        notes: "",
      },
    ],
    courseResults: [
      {
        id: "result",
        code: "SYN-3",
        title: "مقرر افتراضي",
        period: "472",
        section: "SYN",
        activity: "نظري",
        observations: [
          {
            gradeRaw: "هـ",
            totalRaw: "0",
            sourceDate: "2026-06-30",
            titleRaw: "مقرر افتراضي",
            references: [{ evidenceId: "ev", locator: "HTML row 12" }],
          },
          {
            gradeRaw: "",
            totalRaw: "",
            sourceDate: "",
            references: [{ evidenceId: "ev", locator: "HTML row 13" }],
          },
        ],
      },
    ],
  });
describe("نتائج المقررات واستقلال حالة القيد", () => {
  it("يحفظ النسخ القديمة بهويتها ويضيف حقولًا فارغة دون إنشاء نتائج أو تغيير الحالة", () => {
    const old = { ...sample() } as Record<string, unknown>;
    delete old.courseResults;
    delete old.admissionPeriod;
    const parsed = studentSchema.parse(old);
    expect(parsed.courseResults).toEqual([]);
    expect(parsed.admissionPeriod).toBe("");
    expect(parsed.status).toBe("منتظم");
  });
  it("يرفض الأدلة المفقودة والتكرار ويحفظ اختلاف الرموز دون اعتبار الفراغ تعارضًا", () => {
    const s = sample();
    expect(resultConflict(s.courseResults[0])).toBe(false);
    s.courseResults[0].observations.push({
      ...s.courseResults[0].observations[0],
      gradeRaw: "أ",
    });
    expect(resultConflict(s.courseResults[0])).toBe(true);
    expect(studentSchema.safeParse({ ...s, evidence: [] }).success).toBe(false);
    expect(
      studentSchema.safeParse({
        ...s,
        courseResults: [
          ...s.courseResults,
          { ...s.courseResults[0], id: "another" },
        ],
      }).success,
    ).toBe(false);
  });
  it("يفصل الرمز التاريخي عن القيد ويستبعد نتائج المستقبل عند عرض سنة أقدم", () => {
    const s = sample(),
      before = JSON.stringify(s);
    expect(progressGroup(s)).toBe("continuing");
    expect(
      filterDirectory([s], { status: "منتظم", historicalSymbol: "ه" }),
    ).toEqual([s]);
    expect(filterDirectory([s], { failed: true })).toEqual([]);
    expect(historicalResults({ ...s, asOfPeriod: "471" })).toEqual([]);
    expect(
      filterDirectory([{ ...s, asOfPeriod: "471" }], { historicalSymbol: "ه" }),
    ).toEqual([]);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("يصنف قبول يونيو مع قرينة كشف 481 في الأول ويحترم فصل البدء الصريح دون خصم رسوب قديم", () => {
    const s = sample();
    expect(expectedLevel(s)?.value).toBe(1);
    expect(expectedLevel({ ...s, asOfPeriod: "482" })?.value).toBe(2);
    expect(expectedLevel({ ...s, admissionPeriod: "472" })?.value).toBe(2);
    expect(expectedLevel(s)?.method).toContain("قرينة دفعة");
    expect(expectedLevel({ ...s, courseResults: [] })?.value).toBe(1);
  });
  it("يعيد JSON مع الشواهد ويحفظ نتائج المقررات عند تحديث CSV", async () => {
    const s = sample(),
      w = { ...emptyWorkspace(), students: [s] };
    const file = await readImport(new File([backupText(w)], "backup.json"));
    expect(file.backup?.students[0].courseResults).toEqual(s.courseResults);
    const plan = planImport(
      {
        headers: [],
        rows: [
          { n: s.studentNumber, name: s.fullName, p: s.program, d: s.degree },
        ],
      },
      { studentNumber: "n", fullName: "name", program: "p", degree: "d" },
      [s],
      true,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.students[0].courseResults).toEqual(s.courseResults);
  });
  it("يصدر ويطبع الفصل والرمز الخام والمصدر والموضع دون تحويلهما لحالة القيد", async () => {
    const s = sample(),
      rows = resultExportRows([s]);
    expect(rows[0]["التقدير الخام"]).toBe("هـ");
    expect(rows[0]["موضع الصف"]).toBe("HTML row 12");
    expect(rows[0]["مسار المصدر المحلي"]).toBe("/synthetic/results.xls");
    const wb = await createWorkbook([s], ["studentNumber", "status"]);
    expect(wb.getWorksheet("نتائج المقررات")!.rowCount).toBe(3);
    const markup = renderToStaticMarkup(<CourseResults student={s} print />);
    expect(markup).toContain("HTML row 12");
    expect(markup).toContain("/synthetic/results.xls");
    expect(markup).toContain("472");
    expect(markup).toContain("راسب في المقرر");
  });
});
