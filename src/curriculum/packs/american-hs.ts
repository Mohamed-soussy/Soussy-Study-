import type { CurriculumPack, SubjectChoice, SubjectDef, ValidationIssue } from "../types";

/** KiS-ready American high school course list (section 3, American branch). */
const sh = ["Standard", "Honors"] as const;
const sha = ["Standard", "Honors", "AP"] as const;
const ap = ["AP"] as const;
const std = ["Standard"] as const;

const subjects: SubjectDef[] = [
  { id: "eng9", name: "English 9", group: "english", levels: [...sh] },
  { id: "eng10", name: "English 10", group: "english", levels: [...sh] },
  { id: "eng11", name: "English 11", group: "english", levels: [...sh] },
  { id: "eng12", name: "English 12", group: "english", levels: [...sh] },
  { id: "ap-lang", name: "AP English Language", group: "english", levels: [...ap] },
  { id: "ap-lit", name: "AP English Literature", group: "english", levels: [...ap] },

  { id: "alg1", name: "Algebra I", group: "math", levels: [...sh] },
  { id: "geom", name: "Geometry", group: "math", levels: [...sh] },
  { id: "alg2", name: "Algebra II", group: "math", levels: [...sh] },
  { id: "precalc", name: "Precalculus", group: "math", levels: [...sh] },
  { id: "ap-calc-ab", name: "AP Calculus AB", group: "math", levels: [...ap] },
  { id: "ap-calc-bc", name: "AP Calculus BC", group: "math", levels: [...ap] },
  { id: "ap-stats", name: "AP Statistics", group: "math", levels: [...ap] },

  { id: "bio", name: "Biology", group: "science", levels: [...sha] },
  { id: "chem", name: "Chemistry", group: "science", levels: [...sha] },
  { id: "phys", name: "Physics", group: "science", levels: [...sh] },
  { id: "ap-phys-1", name: "AP Physics 1", group: "science", levels: [...ap] },
  { id: "ap-phys-2", name: "AP Physics 2", group: "science", levels: [...ap] },
  { id: "ap-phys-c", name: "AP Physics C: Mechanics", group: "science", levels: [...ap] },
  { id: "envsci", name: "Environmental Science", group: "science", levels: [...sha] },

  { id: "world-hist", name: "World History", group: "social", levels: [...sha] },
  { id: "us-hist", name: "US History", group: "social", levels: [...sha] },
  { id: "gov", name: "Government", group: "social", levels: [...sha] },
  { id: "econ", name: "Economics", group: "social", levels: [...sha] },
  { id: "psych", name: "Psychology", group: "social", levels: [...sha] },

  { id: "arabic", name: "Arabic", group: "arabic", levels: [...sh] },
  { id: "islamic", name: "Islamic Studies", group: "arabic", levels: [...std] },
  { id: "spanish", name: "Spanish", group: "languages", levels: [...sha] },
  { id: "french", name: "French", group: "languages", levels: [...sha] },

  { id: "cs", name: "Computer Science", group: "electives", levels: [...sh] },
  { id: "ap-csa", name: "AP Computer Science A", group: "electives", levels: [...ap] },
  { id: "art", name: "Art", group: "electives", levels: [...sha] },
  { id: "pe", name: "Physical Education", group: "electives", levels: [...std] },
];

const byId = new Map(subjects.map((s) => [s.id, s]));

function validate(choices: SubjectChoice[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (choices.length < 4) issues.push({ key: "usTooFew", values: { count: choices.length } });
  if (choices.length > 10) issues.push({ key: "usTooMany", values: { count: choices.length } });
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
    { id: "g9", labelKey: "g9" },
    { id: "g10", labelKey: "g10" },
    { id: "g11", labelKey: "g11" },
    { id: "g12", labelKey: "g12" },
  ],
  groups: [
    { id: "english", labelKey: "usEnglish" },
    { id: "math", labelKey: "usMath" },
    { id: "science", labelKey: "usScience" },
    { id: "social", labelKey: "usSocial" },
    { id: "arabic", labelKey: "usArabic" },
    { id: "languages", labelKey: "usLanguages" },
    { id: "electives", labelKey: "usElectives" },
  ],
  subjects,
  minSubjects: 4,
  maxSubjects: 10,
  targetGrades: ["A+", "A", "A-", "B+", "B", "B-", "C"],
  allowCustomSubjects: true,
  validate,
};
