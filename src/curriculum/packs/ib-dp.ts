import type { CurriculumPack, SubjectChoice, SubjectDef, ValidationIssue } from "../types";

/** IB Diploma Programme subjects offered at launch, by group. */
const both = ["HL", "SL"] as const;
const slOnly = ["SL"] as const;

const subjects: SubjectDef[] = [
  // Group 1 — Studies in Language and Literature
  { id: "eng-a-langlit", name: "English A: Language and Literature", group: "g1", levels: [...both] },
  { id: "eng-a-lit", name: "English A: Literature", group: "g1", levels: [...both] },
  { id: "ara-a-langlit", name: "Arabic A: Language and Literature", group: "g1", levels: [...both] },
  { id: "ara-a-lit", name: "Arabic A: Literature", group: "g1", levels: [...both] },
  // Group 2 — Language Acquisition
  { id: "eng-b", name: "English B", group: "g2", levels: [...both] },
  { id: "ara-b", name: "Arabic B", group: "g2", levels: [...both] },
  { id: "fre-b", name: "French B", group: "g2", levels: [...both] },
  { id: "spa-b", name: "Spanish B", group: "g2", levels: [...both] },
  { id: "fre-ab", name: "French ab initio", group: "g2", levels: [...slOnly] },
  { id: "spa-ab", name: "Spanish ab initio", group: "g2", levels: [...slOnly] },
  // Group 3 — Individuals and Societies
  { id: "econ", name: "Economics", group: "g3", levels: [...both] },
  { id: "bm", name: "Business Management", group: "g3", levels: [...both] },
  { id: "hist", name: "History", group: "g3", levels: [...both] },
  { id: "psych", name: "Psychology", group: "g3", levels: [...both] },
  { id: "geo", name: "Geography", group: "g3", levels: [...both] },
  { id: "gp", name: "Global Politics", group: "g3", levels: [...both] },
  { id: "ds", name: "Digital Society", group: "g3", levels: [...both] },
  // Group 4 — Sciences
  { id: "bio", name: "Biology", group: "g4", levels: [...both] },
  { id: "chem", name: "Chemistry", group: "g4", levels: [...both] },
  { id: "phys", name: "Physics", group: "g4", levels: [...both] },
  { id: "cs", name: "Computer Science", group: "g4", levels: [...both] },
  { id: "dt", name: "Design Technology", group: "g4", levels: [...both] },
  { id: "sehs", name: "Sports, Exercise and Health Science", group: "g4", levels: [...both] },
  // Interdisciplinary: counts for group 3 or group 4
  { id: "ess", name: "Environmental Systems and Societies", group: "g3g4", levels: [...both] },
  // Group 5 — Mathematics
  { id: "math-aa", name: "Mathematics: Analysis and Approaches", group: "g5", levels: [...both] },
  { id: "math-ai", name: "Mathematics: Applications and Interpretation", group: "g5", levels: [...both] },
  // Group 6 — The Arts
  { id: "va", name: "Visual Arts", group: "g6", levels: [...both] },
  { id: "music", name: "Music", group: "g6", levels: [...both] },
  { id: "theatre", name: "Theatre", group: "g6", levels: [...both] },
  { id: "film", name: "Film", group: "g6", levels: [...both] },
];

const byId = new Map(subjects.map((s) => [s.id, s]));

/**
 * IB Diploma rules (section 3, Step 3):
 * - exactly 6 subjects
 * - 3 or 4 at Higher Level
 * - one from each of groups 1–5 (ESS can fill group 3 or 4)
 * - the 6th from group 6 or a second subject from groups 1–4
 * - only one mathematics course; ab initio is SL only
 */
function validate(choices: SubjectChoice[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const defs = choices.map((c) => byId.get(c.subjectId)).filter((d): d is SubjectDef => !!d);

  if (choices.length !== 6) {
    issues.push({ key: "ibCount", values: { count: choices.length } });
  }

  const hl = choices.filter((c) => c.level === "HL").length;
  if (choices.length > 0 && (hl < 3 || hl > 4)) {
    issues.push({ key: hl < 3 ? "ibTooFewHL" : "ibTooManyHL", values: { count: hl } });
  }

  if (defs.filter((d) => d.group === "g5").length > 1) {
    issues.push({ key: "ibOneMath" });
  }

  choices.forEach((c) => {
    const def = byId.get(c.subjectId);
    if (def && !def.levels.includes(c.level)) {
      issues.push({ key: "ibSlOnly", values: { subject: def.name } });
    }
  });

  // Groups 1, 2 and 5 must be covered directly; 3 and 4 may share ESS.
  for (const g of ["g1", "g2", "g5"]) {
    if (!defs.some((d) => d.group === g)) issues.push({ key: "ibMissingGroup", values: { group: g.slice(1) } });
  }
  const g3 = defs.filter((d) => d.group === "g3").length;
  const g4 = defs.filter((d) => d.group === "g4").length;
  const ess = defs.filter((d) => d.group === "g3g4").length;
  if (g3 + ess === 0) issues.push({ key: "ibMissingGroup", values: { group: 3 } });
  if (g4 + ess === 0) issues.push({ key: "ibMissingGroup", values: { group: 4 } });
  if (g3 === 0 && g4 === 0 && ess === 1) {
    // One ESS cannot cover both groups 3 and 4.
    issues.push({ key: "ibEssBoth" });
  }

  return issues;
}

export const ibDiploma: CurriculumPack = {
  id: "ib-dp",
  nameKey: "ibDp",
  years: [
    { id: "dp1", labelKey: "dp1" },
    { id: "dp2", labelKey: "dp2" },
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
  subjects,
  minSubjects: 6,
  maxSubjects: 6,
  targetGrades: ["7", "6", "5", "4", "3"],
  allowCustomSubjects: false,
  core: ["TOK", "EE", "CAS"],
  validate,
};
