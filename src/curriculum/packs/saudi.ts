import { G, S, simplePack } from "./simple";

/** Saudi national curriculum: intermediate and secondary (all pathways), plus Qudurat and Tahsili. */
const core = S("saCore", ["None"]);
const sci = S("saScience", ["None"]);
const path = S("saPathways", ["None"]);
const exam = S("saExams", ["None"]);

export const saudiNational = simplePack({
  id: "saudi",
  nameKey: "saudi",
  years: [
    { id: "sa-int1", labelKey: "saInt1", grades: [7] },
    { id: "sa-int2", labelKey: "saInt2", grades: [8] },
    { id: "sa-int3", labelKey: "saInt3", grades: [9] },
    { id: "sa-sec1", labelKey: "saSec1", grades: [10] },
    { id: "sa-sec2", labelKey: "saSec2", grades: [11] },
    { id: "sa-sec3", labelKey: "saSec3", grades: [12] },
  ],
  groups: G("saCore", "saScience", "saPathways", "saExams"),
  subjects: [
    core("sa-quran", "Holy Quran / القرآن الكريم"), core("sa-islamic", "Islamic Studies / الدراسات الإسلامية"), core("sa-arabic", "Arabic Language / اللغة العربية"),
    core("sa-english", "English Language / اللغة الإنجليزية"), core("sa-math", "Mathematics / الرياضيات"), core("sa-social", "Social Studies / الدراسات الاجتماعية"),
    core("sa-digital", "Digital Technology / التقنية الرقمية"), core("sa-critical", "Critical Thinking / التفكير الناقد"), core("sa-pe", "Physical Education / التربية البدنية"),
    core("sa-art", "Art Education / التربية الفنية"), core("sa-life", "Life and Family Skills / المهارات الحياتية والأسرية"), core("sa-financial", "Financial Literacy / المعرفة المالية"),
    sci("sa-science", "Science / العلوم"), sci("sa-phys", "Physics / الفيزياء"), sci("sa-chem", "Chemistry / الكيمياء"), sci("sa-bio", "Biology / الأحياء"), sci("sa-earth", "Earth and Space Science / علم الأرض والفضاء"),
    path("sa-cs", "Computer Science and Engineering / علوم الحاسب والهندسة"), path("sa-health", "Health and Life Sciences / الصحة والحياة"),
    path("sa-business", "Business Administration / إدارة الأعمال"), path("sa-sharia", "Sharia / الشرعي"), path("sa-general", "General Track / المسار العام"),
    exam("sa-qudurat", "Qudurat (GAT) / القدرات"), exam("sa-tahsili", "Tahsili (SAAT) / التحصيلي"), exam("sa-step", "STEP English / اختبار ستيب"),
  ],
  minSubjects: 1,
  maxSubjects: 16,
  targetGrades: ["100", "95", "90", "85", "80"],
});
