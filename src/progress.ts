import type { Student } from "./model";
import { normalize } from "./model";
import {
  hasResultSymbol,
  historicalResults,
  historicalResultSummary,
  resultConflict,
} from "./results";

export const progressGroups = [
  { id: "continuing", label: "مستمرون", tone: "green" },
  { id: "graduated", label: "خريجون", tone: "blue" },
  { id: "withdrawn", label: "منسحبون", tone: "amber" },
  { id: "closed", label: "مطوي قيدهم", tone: "amber" },
  { id: "dismissed", label: "مفصولون أكاديميًا", tone: "red" },
  { id: "interrupted", label: "منقطعون", tone: "amber" },
  { id: "unknown", label: "حالة غير موثقة", tone: "neutral" },
] as const;
export type ProgressGroup = (typeof progressGroups)[number]["id"];
const statusGroups: Record<string, ProgressGroup> = {
  متخرج: "graduated",
  منسحب: "withdrawn",
  "مطوي القيد": "closed",
  "مفصول أكاديميًا": "dismissed",
  منقطع: "interrupted",
};
export function progressGroup(s: Pick<Student, "status">): ProgressGroup {
  if (["منتظم", "مؤجل", "معتذر", "مؤجل قبول"].includes(s.status))
    return "continuing";
  return statusGroups[s.status] || "unknown";
}
export const statusLabel = (s: Pick<Student, "status">) =>
  s.status === "متخرج"
    ? "خريج"
    : s.status === "منتظم"
      ? "منتظم · مستمر"
      : s.status;
export const statusTone = (s: Pick<Student, "status">) =>
  progressGroups.find((g) => g.id === progressGroup(s))!.tone;

// A transparent time-based estimate, never a transcript level or a passed-credit claim.
export const LEVEL_METHOD =
  "تقدير زمني: فصل البدء الموثق أولًا، ثم دفعة القبول المسجلة، ثم قرينة كشف فصل أول خلال ستة أشهر من القبول، وإلا السنة الهجرية لتاريخ القبول كتقريب. يفترض بدء الدفعة في الفصل الأول وفصلين اعتياديين سنويًا؛ لا يستنتج فصل البدء من الشهر الميلادي. لا يخصم التأجيل أو الاعتذار أو الرسوب، ولا يثبت المستوى الرسمي أو اجتياز المقررات. الصيفي لا يزيد المستوى.";
export function admissionYear(date: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    return null;
  return (
    Number(
      new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
        year: "numeric",
        timeZone: "Asia/Riyadh",
      })
        .formatToParts(new Date(date + "T12:00:00Z"))
        .find((p) => p.type === "year")?.value,
    ) || null
  );
}
export function expectedLevel(s: Student) {
  let entryYear = admissionYear(s.admissionDate),
    entryTerm = 1;
  let basis = "سنة القبول الهجرية تقريبًا؛ بدء الفصل الأول مفترض";
  if (/^\d{2}[12]$/.test(s.admissionPeriod)) {
    entryYear = 1400 + Number(s.admissionPeriod.slice(0, 2));
    entryTerm = Number(s.admissionPeriod.at(-1));
    basis = `فصل بدء الدراسة الموثق ${s.admissionPeriod}`;
  } else if (/^14\d{2}$/.test(normalize(s.cohort))) {
    entryYear = Number(normalize(s.cohort));
    basis = "دفعة القبول المسجلة؛ بدء الفصل الأول مفترض";
  } else if (s.admissionDate) {
    const entry = s.academicSnapshots
      .filter((x) => {
        const days =
          (Date.parse(x.sourceDate) - Date.parse(s.admissionDate)) / 86400000;
        return (
          x.period.endsWith("1") &&
          x.admissionDateRaw === s.admissionDate &&
          days >= 0 &&
          days <= 183
        );
      })
      .sort((a, b) => a.period.localeCompare(b.period))[0];
    if (entry) {
      entryYear = Number(entry.academicYear);
      basis = `قرينة دفعة من كشف الفصل الأول ${entry.period} القريب من تاريخ القبول`;
    }
  }
  if (
    entryYear === null ||
    !/^14\d{2}$/.test(s.asOfAcademicYear) ||
    !/^\d{2}[123]$/.test(s.asOfPeriod) ||
    Number(s.asOfAcademicYear) !== 1400 + Number(s.asOfPeriod.slice(0, 2))
  )
    return null;
  if (s.sourceDate && s.admissionDate > s.sourceDate) return null;
  if (!["continuing", "interrupted"].includes(progressGroup(s))) return null;
  const term = Math.min(Number(s.asOfPeriod.at(-1)), 2);
  const level =
    (Number(s.asOfAcademicYear) - entryYear) * 2 + term - entryTerm + 1;
  return level >= 1
    ? {
        value: level,
        entryYear,
        method: `${LEVEL_METHOD} أساس الملف: ${basis}.`,
      }
    : null;
}
export function levelLabel(s: Student) {
  const estimate = expectedLevel(s);
  if (estimate)
    return `المستوى ${new Intl.NumberFormat("ar-SA").format(estimate.value)} · تقديري`;
  return ["graduated", "withdrawn", "closed", "dismissed"].includes(
    progressGroup(s),
  )
    ? "انتهى القيد"
    : "يلزم تاريخ قبول وفصل رصد";
}
export function courseResult(s: Student) {
  if (s.courseResults.length) return historicalResultSummary(s);
  if (!s.courses.length) return "لم يرفق كشف درجات";
  const failed = s.courses.filter((c) => c.result === "غير مجتاز").length;
  return failed
    ? `${failed} مقرر غير مجتاز في السجل المرفق`
    : "لا مقررات غير مجتازة في السجل المرفق";
}
export function filterPopulation(
  students: Student[],
  program = "",
  degree = "",
) {
  return students.filter(
    (s) =>
      (!program || s.program === program) && (!degree || s.degree === degree),
  );
}
export type DirectoryFilters = {
  query?: string;
  group?: string;
  status?: string;
  stage?: string;
  level?: string;
  failed?: boolean;
  historicalSymbol?: string;
};
export function filterDirectory(students: Student[], f: DirectoryFilters) {
  return students.filter(
    (s) =>
      (!f.group || progressGroup(s) === f.group) &&
      (!f.status || s.status === f.status) &&
      (!f.stage || s.stage === f.stage) &&
      (!f.level || String(expectedLevel(s)?.value || "") === f.level) &&
      (!f.failed || s.courses.some((c) => c.result === "غير مجتاز")) &&
      (!f.historicalSymbol ||
        historicalResults(s).some((r) =>
          f.historicalSymbol === "conflict"
            ? resultConflict(r)
            : f.historicalSymbol === "any"
              ? ["ع", "ح", "ه"].some((code) => hasResultSymbol(r, code))
              : hasResultSymbol(r, f.historicalSymbol!),
        )) &&
      (!f.query ||
        normalize(
          [
            s.fullName,
            s.studentNumber,
            s.program,
            s.degree,
            s.supervisor,
            s.thesisTitle,
            s.status,
          ].join(" "),
        ).includes(normalize(f.query))),
  );
}
