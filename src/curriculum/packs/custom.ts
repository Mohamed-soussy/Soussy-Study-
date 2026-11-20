import type { CurriculumPack, SubjectChoice, ValidationIssue } from "../types";

/**
 * "Build my own": any curriculum without a pack yet (Cambridge, Edexcel, Saudi
 * national and others until their packs ship). The student types their subjects.
 * Later phases let them upload a syllabus so the AI can build a real pack.
 */
function validate(choices: SubjectChoice[]): ValidationIssue[] {
  if (choices.length < 1) return [{ key: "customTooFew" }];
  if (choices.length > 12) return [{ key: "customTooMany", values: { count: choices.length } }];
  return [];
}

export const customPack: CurriculumPack = {
  id: "custom",
  nameKey: "custom",
  years: [
    { id: "y7", labelKey: "y7", grades: [6] },
    { id: "y8", labelKey: "y8", grades: [7] },
    { id: "y9", labelKey: "y9", grades: [8] },
    { id: "y10", labelKey: "y10", grades: [9] },
    { id: "y11", labelKey: "y11", grades: [10] },
    { id: "y12", labelKey: "y12", grades: [11] },
    { id: "y13", labelKey: "y13", grades: [12] },
    { id: "uni", labelKey: "uni", grades: [13] },
  ],
  groups: [{ id: "custom", labelKey: "custom" }],
  subjects: [],
  minSubjects: 1,
  maxSubjects: 12,
  targetGrades: [],
  allowCustomSubjects: true,
  validate,
};
