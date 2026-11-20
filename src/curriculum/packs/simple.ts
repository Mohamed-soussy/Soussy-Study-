import type { CurriculumPack, GroupDef, SubjectChoice, SubjectDef, ValidationIssue } from "../types";

/** A curriculum where students pick any number of subjects within a range (most systems). */
export function simplePack(p: Omit<CurriculumPack, "validate" | "allowCustomSubjects"> & { allowCustomSubjects?: boolean }): CurriculumPack {
  const byId = new Map(p.subjects.map((s) => [s.id, s]));
  const validate = (choices: SubjectChoice[]): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];
    if (choices.length < p.minSubjects) issues.push({ key: "packTooFew", values: { count: choices.length, min: p.minSubjects } });
    if (choices.length > p.maxSubjects) issues.push({ key: "packTooMany", values: { count: choices.length, max: p.maxSubjects } });
    choices.forEach((c) => {
      const def = byId.get(c.subjectId);
      if (def && !def.levels.includes(c.level)) issues.push({ key: "usLevel", values: { subject: def.name, level: c.level } });
    });
    return issues;
  };
  return { allowCustomSubjects: true, ...p, validate };
}

export const S = (group: string, levels: SubjectDef["levels"]) => (id: string, name: string): SubjectDef => ({ id, name, group, levels });
export const G = (...ids: string[]): GroupDef[] => ids.map((id) => ({ id, labelKey: id }));
