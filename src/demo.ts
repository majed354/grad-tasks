import { newStudent, today } from "./model";
import type { Workspace } from "./model";
import { programs, stages } from "./catalog";
export function demoWorkspace(): Workspace {
  const names = [
    "طالب تجريبي ألف",
    "طالبة تجريبية باء",
    "طالب تجريبي جيم",
    "طالبة تجريبية دال",
    "طالب تجريبي هاء",
    "طالبة تجريبية واو",
    "طالب تجريبي زاي",
    "طالبة تجريبية حاء",
    "طالب تجريبي طاء",
    "طالبة تجريبية ياء",
  ];
  return {
    schemaVersion: 1,
    revision: 0,
    activity: [],
    students: programs.map((p, i) => ({
      ...newStudent(),
      id: `demo-${i}`,
      studentNumber: `DEMO-${100 + i}`,
      fullName: names[i],
      program: p.name,
      degree: p.degree,
      department: p.department,
      gender: i % 2 ? "أنثى" : "ذكر",
      cohort: i % 3 === 0 ? "1445" : "1446",
      admissionDate: "2024-09-01",
      source: "سجل افتراضي لا يمثل طالبًا حقيقيًا",
      sourceDate: today(),
      stage: stages[i % 6],
      status: i === 5 ? "مؤجل" : "منتظم",
      supervisor: i % 3 ? "مشرف تجريبي" : "",
      gpa: 4.2,
      gpaScale: 5,
      completedCredits: 18,
      requiredCredits: 36,
      thesisTitle:
        i % 6 ? "عنوان بحث افتراضي لتجربة متابعة الرسالة العلمية" : "",
      notes: "جميع البيانات والأسماء في هذا السجل افتراضية لغرض تجربة الواجهة.",
      tasks: [
        {
          id: crypto.randomUUID(),
          title: [
            "مراجعة تقرير التقدم",
            "استكمال وثيقة اعتماد الخطة",
            "تحديد موعد لقاء الإشراف",
          ][i % 3],
          dueDate: i < 3 ? "2026-10-20" : "2026-11-15",
          owner: "منسق البرنامج",
          priority: i < 3 ? "عالية" : "عادية",
          done: i === 6,
        },
      ],
      decisions:
        i % 2
          ? [
              {
                id: crypto.randomUUID(),
                title: "اعتماد خطة البحث — مثال",
                number: "تجريبي 12",
                date: "2026-09-15",
                council: "مجلس افتراضي",
                page: "3",
                url: "",
                notes: "مثال فقط",
              },
            ]
          : [],
      followUps: [
        {
          id: crypto.randomUUID(),
          date: today(),
          text: "تم إنشاء سجل افتراضي لاختبار مساحة العمل.",
        },
      ],
    })),
  };
}
