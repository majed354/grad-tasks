export const degrees = ["ماجستير", "دكتوراه"] as const;
export const statuses = [
  "منتظم",
  "مؤجل",
  "معتذر",
  "منقطع",
  "منسحب",
  "مطوي القيد",
  "متخرج",
  "مفصول أكاديميًا",
  "مؤجل قبول",
  "غير موثق",
] as const;
export const stages = [
  "المقررات",
  "إعداد الخطة",
  "تسجيل الرسالة",
  "كتابة الرسالة",
  "المناقشة",
  "استكمال التخرج",
  "متخرج",
  "غير موثق",
] as const;
export const knownStages = stages.filter((stage) => stage !== "غير موثق");
// مرجع الأسماء: README مستودع الخطط، تمت مراجعته في 2026-10-25. ليست قواعد مدد أو خطط معتمدة.
export const programs = [
  { name: "أصول الفقه", degree: "ماجستير", department: "الشريعة" },
  { name: "الفقه", degree: "ماجستير", department: "الشريعة" },
  { name: "القانون", degree: "ماجستير", department: "الأنظمة" },
  { name: "العقيدة", degree: "ماجستير", department: "الثقافة الإسلامية" },
  { name: "القراءات", degree: "ماجستير", department: "القراءات" },
  {
    name: "الدراسات القرآنية المعاصرة",
    degree: "ماجستير",
    department: "القراءات",
  },
  { name: "أصول الفقه", degree: "دكتوراه", department: "الشريعة" },
  { name: "الفقه", degree: "دكتوراه", department: "الشريعة" },
  { name: "القراءات", degree: "دكتوراه", department: "القراءات" },
  { name: "الدراسات القرآنية", degree: "دكتوراه", department: "القراءات" },
] as const;
export const sources = [
  {
    id: "plans",
    title: "الخطط والتوصيفات",
    description: "مرجع البرامج والمقررات والخطط وإصداراتها.",
    url: "https://github.com/majed354/courseOfShar3ah",
    type: "خطط دراسية",
    relation:
      "ربط البرنامج والدرجة والخطة ثم رمز المقرر؛ لا يُستنتج اجتياز الطالب من وجود المقرر.",
  },
  {
    id: "councils",
    title: "مجالس الأقسام",
    description: "مصدر قرارات الخطط والإشراف والمناقشات.",
    url: "https://github.com/majed354/IndexForMeeting",
    type: "قرارات",
    relation:
      "توثيق القرار والمجلس والتاريخ والصفحة وربط الطالب بدليل صريح. المستودع خاص.",
  },
  {
    id: "faculty",
    title: "النشاط العلمي للأعضاء",
    description: "مرجع محتمل للإشراف والرسائل والإنتاج العلمي.",
    url: "https://github.com/majed354/faculty-activities",
    type: "إشراف وبحث",
    relation:
      "مطابقة العضو بمعرف موثق والطالب برقمه الجامعي. تشابه الاسم لا يثبت الارتباط.",
  },
  {
    id: "sheet",
    title: "شيت نشاطات الأعضاء",
    description: "مصدر العمل المشترك لنشاطات الأعضاء.",
    url: "https://docs.google.com/spreadsheets/d/1UUfbmn5LkDSLpUxDCZS6D33HVuPjkRfnwi67CEKWGS0/edit",
    type: "Google Sheets",
    relation:
      "لم تستورد صفوفه في هذا الإصدار. يلزم تحديد الأعمدة والصلاحيات قبل مزامنة بيانات شخصية.",
  },
  {
    id: "kpi",
    title: "مؤشرات الأداء",
    description: "مؤشرات البرنامج ونتائج القياس المجمعة.",
    url: "https://github.com/majed354/KPI_TaifShare3h",
    type: "مؤشرات",
    relation: "مؤشرات البرنامج سياق مجمع، ولا تمثل حالة الطالب الفردية.",
  },
  {
    id: "surveys",
    title: "استطلاعات الرأي",
    description: "تقييم البرامج والمقررات والإشراف والخدمات.",
    url: "https://github.com/majed354/Shari3ahSurveys",
    type: "قياس الجودة",
    relation:
      "تقرأ النتائج المجمعة فقط بعد الربط بالبرنامج والسنة. لا تنسب الاستجابة إلى طالب.",
  },
  {
    id: "study",
    title: "الدراسة الذاتية",
    description: "إطار الأدلة والمحكات واللوائح المؤسسية.",
    url: "https://github.com/majed354/self_study",
    type: "أدلة ولوائح",
    relation: "ربط الوثيقة بإصدارها وسنتها؛ القالب الفارغ لا يعد دليل تطبيق.",
  },
];
