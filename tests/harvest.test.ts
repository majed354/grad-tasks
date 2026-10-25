import { it, expect } from "vitest";
import {
  newStudent,
  studentSchema,
  formatGpa,
  emptyWorkspace,
} from "../src/model";
import { readImport, planImport, createWorkbook } from "../src/io";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrintableStudents } from "../src/Profile";
const fixture = () =>
  studentSchema.parse({
    ...newStudent(),
    studentNumber: "SYN-100",
    fullName: "طالب اختبار افتراضي",
    program: "برنامج افتراضي",
    degree: "دكتوراه",
    gpa: 4.2,
    gpaScale: null,
    status: "غير موثق",
    stage: "غير موثق",
    asOfAcademicYear: "1446",
    evidence: [
      {
        id: "ev",
        sourceId: "synthetic-source",
        kind: "محضر افتراضي",
        url: "https://example.com/minutes.pdf",
        locator: "PDF page 3",
        observedAt: "2026-10-25T12:00:00+03:00",
        fields: ["title", "studentNumber"],
        rawDate: "1446-02",
        calendar: "هجري",
        notes: "للاختبار فقط",
      },
    ],
    researchRecords: [
      {
        id: "th",
        title: "رسالة اختبار افتراضية",
        degree: "دكتوراه",
        program: "برنامج افتراضي",
        year: "1446",
        status: "منجزة",
        defenseDateRaw: "1446-02-03",
        defenseCalendar: "هجري",
        supervisorId: "",
        supervisor: "مشرف افتراضي",
        coSupervisorId: "",
        coSupervisor: "",
        examiner1Id: "",
        examiner1: "",
        examiner2Id: "",
        examiner2: "",
        verification: "موثق",
        evidenceIds: ["ev"],
      },
    ],
  });
it("يحفظ الدليل وتاريخ الرسالة الهجري والمقياس غير المعروف عبر الاستيراد وإعادة الاستيراد", async () => {
  const s = fixture();
  const f = new File(
    [JSON.stringify({ ...emptyWorkspace(), students: [s] })],
    "synthetic.grad.json",
  );
  const parsed = await readImport(f);
  const p = planImport(parsed, {}, [], false);
  expect(p.errors).toEqual([]);
  expect(p.students[0]).toEqual(s);
  expect(p.students[0].defenseDate).toBe("");
  expect(formatGpa(s)).toContain("المقياس غير موثق");
  expect(planImport(parsed, {}, p.students, false)).toMatchObject({
    added: 0,
    skipped: 1,
  });
  expect(
    planImport(parsed, {}, p.students, true).students[0].researchRecords,
  ).toEqual(s.researchRecords);
  const {
    evidence: _,
    researchRecords: __,
    asOfAcademicYear: ___,
    ...legacy
  } = s;
  expect(studentSchema.parse(legacy).evidence).toEqual([]);
  expect(studentSchema.safeParse({ ...s, evidence: [] }).success).toBe(false);
});
it("ينقل مصادر الرسالة وتواريخها إلى Excel والطباعة مع مواضع الأدلة", async () => {
  const s = fixture();
  const wb = await createWorkbook(
    [s],
    ["studentNumber", "fullName", "asOfAcademicYear", "gpaScale"],
  );
  const sources = wb.getWorksheet("المصادر")!;
  const theses = wb.getWorksheet("الرسائل")!;
  expect(sources.getRow(2).values).toContain("ev");
  expect(sources.getRow(2).values).toContain("PDF page 3");
  expect(theses.getRow(2).values).toContain("1446-02-03");
  expect(theses.getRow(2).values).toContain("ev");
  const html = renderToStaticMarkup(
    createElement(PrintableStudents, { students: [s], demo: false }),
  );
  expect(html).toContain("1446-02-03");
  expect(html).toContain("PDF page 3");
  expect(html).toContain("محضر افتراضي");
});
