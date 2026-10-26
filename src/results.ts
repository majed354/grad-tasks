import type { CourseResult, Student } from "./model";
import { normalize } from "./model";

export const resultSymbols = {
  ع: "منقطع في المقرر",
  ح: "محروم في المقرر",
  ه: "راسب في المقرر",
} as const;
export const gradeCode = (raw: string) => normalize(raw).replace(/\s+/g, "");
export function resultGrades(r: CourseResult) {
  return [
    ...new Set(
      r.observations
        .map((o) => gradeCode(o.gradeRaw))
        .filter((g) => g && !/^[\d.,% -]+$/.test(g)),
    ),
  ];
}
export const resultConflict = (r: CourseResult) => resultGrades(r).length > 1;
export const hasResultSymbol = (r: CourseResult, symbol: string) =>
  resultGrades(r).includes(symbol);
export function historicalResults(s: Student) {
  return s.courseResults.filter(
    (r) => !/^\d{3}$/.test(s.asOfPeriod) || r.period <= s.asOfPeriod,
  );
}
export function historicalResultSummary(s: Student) {
  const rows = historicalResults(s);
  if (!rows.length) return "لا نتائج تاريخية مرفقة";
  const counts = Object.keys(resultSymbols)
    .map((symbol) => {
      const count = rows.filter((r) => hasResultSymbol(r, symbol)).length;
      return count ? `${symbol === "ه" ? "هـ" : symbol}: ${count}` : "";
    })
    .filter(Boolean);
  return counts.length
    ? `رموز سابقة · ${counts.join(" · ")}`
    : `${rows.length} نتيجة تاريخية مرفقة`;
}
export function gradeDescription(raw: string) {
  const code = gradeCode(raw);
  return (
    resultSymbols[code as keyof typeof resultSymbols] ||
    (raw ? `التقدير: ${raw}` : "لم يرصد تقدير في هذه النسخة")
  );
}
export function resultExportRows(students: Student[]) {
  return students.flatMap((s) =>
    s.courseResults.flatMap((r) =>
      r.observations.flatMap((o) =>
        o.references.map((ref) => {
          const e = s.evidence.find((e) => e.id === ref.evidenceId);
          return {
            "الرقم الجامعي": s.studentNumber,
            البرنامج: s.program,
            الدرجة: s.degree,
            الفصل: r.period,
            "السنة الأكاديمية": `14${r.period.slice(0, 2)}`,
            "رمز المقرر": r.code,
            المقرر: r.title,
            "عنوان المقرر في المصدر": o.titleRaw,
            النشاط: r.activity,
            الشعبة: r.section,
            "التقدير الخام": o.gradeRaw,
            "دلالة الرمز في المقرر": gradeDescription(o.gradeRaw),
            "المجموع كما ورد": o.totalRaw,
            "اختلاف تقديرات المصادر": resultConflict(r) ? "للمراجعة" : "",
            "تاريخ استخراج المصدر": o.sourceDate,
            "معرف الدليل": ref.evidenceId,
            "موضع الصف": ref.locator,
            المصدر: e?.sourceName || "",
            "مسار المصدر المحلي": e?.sourcePath || "",
            "رابط المصدر": e?.url || "",
            "حدود الدلالة":
              "نتيجة مقرر تاريخية؛ لا تغير حالة القيد في كشف السنة المحددة",
          };
        }),
      ),
    ),
  );
}
