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
    { id: "y7", labelKey: "y7" },
    { id: "y8", labelKey: "y8" },
    { id: "y9", labelKey: "y9" },
    { id: "y10", labelKey: "y10" },
    { id: "y11", labelKey: "y11" },
    { id: "y12", labelKey: "y12" },
    { id: "y13", labelKey: "y13" },
    { id: "uni", labelKey: "uni" },
  ],
  groups: [{ id: "custom", labelKey: "custom" }],
  subjects: [],
  minSubjects: 1,
  maxSubjects: 12,
  targetGrades: [],
  allowCustomSubjects: true,
  validate,
};
