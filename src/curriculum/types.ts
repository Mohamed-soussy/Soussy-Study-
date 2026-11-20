/**
 * Curriculum packs (Master Build Prompt, section 3A).
 * One pack per programme. Screens read packs; nothing is hard-coded to IB or AP.
 * Later phases add syllabus units, assessments, command words and exam sessions.
 */

export type Level =
  | "HL" | "SL" // IB Diploma
  | "Standard" | "Honors" | "AP" // American; "Standard"/"Extended" also MYP maths
  | "Extended" | "Core" // Cambridge IGCSE tiers, MYP extended maths
  | "Foundation" | "Higher" // UK GCSE tiers
  | "GCSE" | "IGCSE" | "AS" | "A Level" | "BTEC" // British qualifications
  | "None";

export interface SubjectDef {
  id: string;
  name: string;
  /** Group or area id, e.g. IB "g4" or American "science". */
  group: string;
  levels: Level[];
}

export interface GroupDef {
  id: string;
  /** i18n key under "curriculum.groups". */
  labelKey: string;
}

/** One chosen subject. `name` is set for student-typed subjects. */
export interface SubjectChoice {
  subjectId: string;
  name: string;
  level: Level;
}

/** A rule problem, translated through "validation.<key>" with values. */
export interface ValidationIssue {
  key: string;
  values?: Record<string, string | number>;
}

export interface CurriculumPack {
  id: string;
  /** i18n key under "curriculum.packs". */
  nameKey: string;
  /** Year options, e.g. DP1/DP2 or Grade 9–12; `grades` = the school grades (6–13) each covers. */
  years: { id: string; labelKey: string; grades?: number[] }[];
  groups: GroupDef[];
  subjects: SubjectDef[];
  minSubjects: number;
  maxSubjects: number;
  /** Target-grade options for the Goals step. */
  targetGrades: string[];
  /** Students may type subjects that are not in the list. */
  allowCustomSubjects: boolean;
  /** Core components every student in this programme has (IB: TOK, EE, CAS). */
  core?: string[];
  validate: (choices: SubjectChoice[]) => ValidationIssue[];
}
