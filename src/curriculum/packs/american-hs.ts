import type { CurriculumPack, SubjectChoice, SubjectDef, ValidationIssue } from "../types";

/** KiS-ready American high school course list (section 3, American branch). */
const sh = ["Standard", "Honors"] as const;
const ap = ["AP"] as const;
const std = ["Standard"] as const;

const subjects: SubjectDef[] = [
  // English: one course per year; pick the level, not the grade
  { id: "eng", name: "English", group: "english", levels: [...sh] },
  { id: "eng-creative", name: "Creative Writing", group: "english", levels: [...std] },
  { id: "eng-speech", name: "Speech and Debate", group: "english", levels: [...std] },
  // Math
  { id: "alg1", name: "Algebra I", group: "math", levels: [...sh] },
  { id: "geom", name: "Geometry", group: "math", levels: [...sh] },
  { id: "alg2", name: "Algebra II", group: "math", levels: [...sh] },
  { id: "precalc", name: "Precalculus", group: "math", levels: [...sh] },
  { id: "calc", name: "Calculus", group: "math", levels: [...sh] },
  { id: "stats", name: "Statistics", group: "math", levels: [...sh] },
  // Science
  { id: "bio", name: "Biology", group: "science", levels: [...sh] },
  { id: "chem", name: "Chemistry", group: "science", levels: [...sh] },
  { id: "phys", name: "Physics", group: "science", levels: [...sh] },
  { id: "envsci", name: "Environmental Science", group: "science", levels: [...sh] },
  { id: "earthsci", name: "Earth and Space Science", group: "science", levels: [...sh] },
  { id: "anatomy", name: "Anatomy and Physiology", group: "science", levels: [...sh] },
  // Social studies
  { id: "world-hist", name: "World History", group: "social", levels: [...sh] },
  { id: "us-hist", name: "US History", group: "social", levels: [...sh] },
  { id: "gov", name: "Government", group: "social", levels: [...sh] },
  { id: "econ", name: "Economics", group: "social", levels: [...sh] },
  { id: "psych", name: "Psychology", group: "social", levels: [...sh] },
  { id: "geog", name: "Geography", group: "social", levels: [...sh] },
  // Arabic and Islamic studies
  { id: "arabic", name: "Arabic", group: "arabic", levels: [...sh] },
  { id: "islamic", name: "Islamic Studies", group: "arabic", levels: [...std] },
  { id: "ksa-social", name: "Saudi Social Studies", group: "arabic", levels: [...std] },
  // World languages
  { id: "spanish", name: "Spanish", group: "languages", levels: [...sh] },
  { id: "french", name: "French", group: "languages", levels: [...sh] },
  { id: "chinese", name: "Chinese", group: "languages", levels: [...sh] },
  // Electives
  { id: "cs", name: "Computer Science", group: "electives", levels: [...sh] },
  { id: "art", name: "Art", group: "electives", levels: [...std] },
  { id: "music", name: "Music", group: "electives", levels: [...std] },
  { id: "drama", name: "Drama", group: "electives", levels: [...std] },
  { id: "pe", name: "Physical Education", group: "electives", levels: [...std] },
  { id: "health", name: "Health", group: "electives", levels: [...std] },
  { id: "business", name: "Business", group: "electives", levels: [...std] },
  // Advanced Placement (every AP course)
  ...[
    ["ap-african-am", "AP African American Studies"], ["ap-art-hist", "AP Art History"], ["ap-bio", "AP Biology"], ["ap-calc-ab", "AP Calculus AB"],
    ["ap-calc-bc", "AP Calculus BC"], ["ap-chem", "AP Chemistry"], ["ap-chinese", "AP Chinese Language and Culture"], ["ap-comp-gov", "AP Comparative Government and Politics"],
    ["ap-csa", "AP Computer Science A"], ["ap-csp", "AP Computer Science Principles"], ["ap-lang", "AP English Language and Composition"], ["ap-lit", "AP English Literature and Composition"],
    ["ap-env", "AP Environmental Science"], ["ap-euro", "AP European History"], ["ap-french", "AP French Language and Culture"], ["ap-german", "AP German Language and Culture"],
    ["ap-human-geo", "AP Human Geography"], ["ap-italian", "AP Italian Language and Culture"], ["ap-japanese", "AP Japanese Language and Culture"], ["ap-latin", "AP Latin"],
    ["ap-macro", "AP Macroeconomics"], ["ap-micro", "AP Microeconomics"], ["ap-music-theory", "AP Music Theory"], ["ap-phys-1", "AP Physics 1"], ["ap-phys-2", "AP Physics 2"],
    ["ap-phys-c", "AP Physics C: Mechanics"], ["ap-phys-c-em", "AP Physics C: Electricity and Magnetism"], ["ap-precalc", "AP Precalculus"], ["ap-psych", "AP Psychology"],
    ["ap-research", "AP Research"], ["ap-seminar", "AP Seminar"], ["ap-spanish-lang", "AP Spanish Language and Culture"], ["ap-spanish-lit", "AP Spanish Literature and Culture"],
    ["ap-stats", "AP Statistics"], ["ap-2d-art", "AP 2-D Art and Design"], ["ap-3d-art", "AP 3-D Art and Design"], ["ap-drawing", "AP Drawing"],
    ["ap-us-gov", "AP United States Government and Politics"], ["ap-ush", "AP United States History"], ["ap-world", "AP World History: Modern"],
  ].map(([id, name]): SubjectDef => ({ id, name, group: "ap", levels: [...ap] })),
];

const byId = new Map(subjects.map((s) => [s.id, s]));

function validate(choices: SubjectChoice[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (choices.length < 1) issues.push({ key: "usTooFew", values: { count: choices.length } });
  if (choices.length > 14) issues.push({ key: "usTooMany", values: { count: choices.length } });
  choices.forEach((c) => {
    const def = byId.get(c.subjectId);
    if (def && !def.levels.includes(c.level)) {
      issues.push({ key: "usLevel", values: { subject: def.name, level: c.level } });
    }
  });
  return issues;
}

export const americanHighSchool: CurriculumPack = {
  id: "american-hs",
  nameKey: "americanHs",
  years: [
    { id: "g6", labelKey: "g6", grades: [6] },
    { id: "g7", labelKey: "g7", grades: [7] },
    { id: "g8", labelKey: "g8", grades: [8] },
    { id: "g9", labelKey: "g9", grades: [9] },
    { id: "g10", labelKey: "g10", grades: [10] },
    { id: "g11", labelKey: "g11", grades: [11] },
    { id: "g12", labelKey: "g12", grades: [12] },
  ],
  groups: [
    { id: "english", labelKey: "usEnglish" },
    { id: "math", labelKey: "usMath" },
    { id: "science", labelKey: "usScience" },
    { id: "social", labelKey: "usSocial" },
    { id: "arabic", labelKey: "usArabic" },
    { id: "languages", labelKey: "usLanguages" },
    { id: "electives", labelKey: "usElectives" },
    { id: "ap", labelKey: "usAp" },
  ],
  subjects,
  minSubjects: 1,
  maxSubjects: 14,
  targetGrades: ["A+", "A", "A-", "B+", "B", "B-", "C"],
  allowCustomSubjects: true,
  validate,
};
