import type { CurriculumPack, SubjectChoice, ValidationIssue } from "../types";
import { dpSubjects } from "./ib-dp";

/**
 * IB Career-related Programme (grades 11–12): at least two Diploma courses, a career-related
 * study (typed by the student) and the CP core.
 */
function validate(choices: SubjectChoice[]): ValidationIssue[] {
  const dp = choices.filter((c) => !c.subjectId.startsWith("custom-")).length;
  return dp < 2 ? [{ key: "cpTwoDp", values: { count: dp } }] : choices.length > 8 ? [{ key: "packTooMany", values: { count: choices.length, max: 8 } }] : [];
}

export const ibCp: CurriculumPack = {
  id: "ib-cp",
  nameKey: "ibCp",
  years: [
    { id: "cp1", labelKey: "cp1", grades: [11] },
    { id: "cp2", labelKey: "cp2", grades: [12] },
  ],
  groups: [
    { id: "g1", labelKey: "ib1" },
    { id: "g2", labelKey: "ib2" },
    { id: "g3", labelKey: "ib3" },
    { id: "g4", labelKey: "ib4" },
    { id: "g3g4", labelKey: "ib34" },
    { id: "g5", labelKey: "ib5" },
    { id: "g6", labelKey: "ib6" },
  ],
  subjects: dpSubjects,
  minSubjects: 2,
  maxSubjects: 8,
  targetGrades: ["7", "6", "5", "4", "3"],
  allowCustomSubjects: true,
  core: ["Personal and Professional Skills", "Service Learning", "Language Development", "Reflective Project"],
  validate,
};
