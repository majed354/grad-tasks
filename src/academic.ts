import type { Student, AcademicSnapshot } from "./model";
export const DEFAULT_ACADEMIC_YEAR = "1448";
export const yearLabel = (year: string) =>
  new Intl.NumberFormat("ar-SA", { useGrouping: false }).format(Number(year));
export const semesterName = (period: string) =>
  ({
    "1": "الفصل الأول",
    "2": "الفصل الثاني",
    "3": "الفصل الصيفي",
    "4": "الفصل الرابع",
    "5": "الفصل الخامس",
  })[period.slice(-1)] || "فصل غير محدد";
export function availableYears(students: Student[]) {
  return [
    ...new Set([
      DEFAULT_ACADEMIC_YEAR,
      ...students.flatMap((s) =>
        s.academicSnapshots.map((x) => x.academicYear),
      ),
    ]),
  ].sort((a, b) => Number(b) - Number(a));
}
export function availablePeriods(students: Student[], year: string) {
  return [
    ...new Set(
      students.flatMap((s) =>
        s.academicSnapshots
          .filter((x) => x.academicYear === year)
          .map((x) => x.period),
      ),
    ),
  ].sort();
}
export function defaultPeriod(periods: string[]) {
  // The second regular semester is used when present; summer never silently replaces it.
  return (
    periods.find((p) => p.endsWith("2")) ||
    periods.find((p) => p.endsWith("1")) ||
    periods.at(-1) ||
    ""
  );
}
const isoDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v
    ? v
    : "";
export function projectSnapshot(
  student: Student,
  snapshot: AcademicSnapshot,
): Student {
  return {
    ...student,
    status: snapshot.status,
    stage: snapshot.stage,
    gpa: snapshot.gpa,
    gpaScale: snapshot.gpaScale,
    department: snapshot.department,
    gender: snapshot.gender,
    nationality: snapshot.nationality,
    admissionDate: isoDate(snapshot.admissionDateRaw) || student.admissionDate,
    graduationDate: isoDate(snapshot.graduationDateRaw),
    asOfAcademicYear: snapshot.academicYear,
    asOfPeriod: snapshot.period,
    sourceDate: snapshot.sourceDate,
    source: `كشف ${snapshot.period} · ${snapshot.academicYear}هـ`,
  };
}
export function academicScope(
  students: Student[],
  year: string,
  requestedPeriod = "",
) {
  const periods = availablePeriods(students, year);
  if (year === "all")
    return {
      students,
      year,
      period: "",
      periods,
      sourceDate: "",
      available: students.length > 0,
      label: "جميع السنوات · آخر رصد لكل قيد",
    };
  const period = periods.includes(requestedPeriod)
    ? requestedPeriod
    : defaultPeriod(periods);
  const snapshots = students.flatMap((s) =>
    s.academicSnapshots.filter(
      (x) => x.period === period && x.academicYear === year,
    ),
  );
  const sourceDate =
    snapshots
      .map((x) => x.sourceDate)
      .sort()
      .at(-1) || "";
  const selected = students.flatMap((s) => {
    const snapshot = s.academicSnapshots.find(
      (x) =>
        x.academicYear === year &&
        x.period === period &&
        x.sourceDate === sourceDate,
    );
    return snapshot ? [projectSnapshot(s, snapshot)] : [];
  });
  return {
    students: selected,
    year,
    period,
    periods,
    sourceDate,
    available: snapshots.length > 0,
    label: `${year}هـ${period ? " · " + semesterName(period) + " · " + period : ""}`,
  };
}
export function canonicalExportStudents(
  workspace: Student[],
  selected: Student[],
) {
  const canonical = new Map(workspace.map((s) => [s.id, s]));
  return selected.map((s) => canonical.get(s.id) || s);
}
