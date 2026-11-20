import { americanHighSchool } from "./packs/american-hs";
import { cambridge } from "./packs/cambridge";
import { customPack } from "./packs/custom";
import { edexcel } from "./packs/edexcel";
import { frenchBac } from "./packs/french";
import { ibCp } from "./packs/ib-cp";
import { ibDiploma } from "./packs/ib-dp";
import { ibMyp } from "./packs/ib-myp";
import { indianBoards } from "./packs/indian";
import { saudiNational } from "./packs/saudi";
import { ukNational } from "./packs/uk";
import type { CurriculumPack } from "./types";

export const packs: Record<string, CurriculumPack> = {
  [ibDiploma.id]: ibDiploma,
  [ibMyp.id]: ibMyp,
  [ibCp.id]: ibCp,
  [americanHighSchool.id]: americanHighSchool,
  [cambridge.id]: cambridge,
  [edexcel.id]: edexcel,
  [ukNational.id]: ukNational,
  [saudiNational.id]: saudiNational,
  [indianBoards.id]: indianBoards,
  [frenchBac.id]: frenchBac,
  [customPack.id]: customPack,
};

/**
 * Curriculum cards shown in onboarding (section 3A families).
 * `packId` is the pack that powers the card; families without a finished
 * pack use "custom" and are labeled so the student knows.
 */
export const curriculumCards: { id: string; packId: string; ready: boolean }[] = [
  { id: "ib", packId: "ib-dp", ready: true },
  { id: "ibMyp", packId: "ib-myp", ready: true },
  { id: "ibCp", packId: "ib-cp", ready: true },
  { id: "american", packId: "american-hs", ready: true },
  { id: "cambridge", packId: "cambridge", ready: true },
  { id: "edexcel", packId: "edexcel", ready: true },
  { id: "uk", packId: "uk", ready: true },
  { id: "saudi", packId: "saudi", ready: true },
  { id: "indian", packId: "indian", ready: true },
  { id: "french", packId: "french", ready: true },
  { id: "own", packId: "custom", ready: true },
];

/** School grades a student can pick first (13 = university or after school). */
export const GRADES = [6, 7, 8, 9, 10, 11, 12, 13] as const;

/** Does this curriculum have a year for this grade? (Used to suggest curricula after the grade.) */
export function fitsGrade(packId: string, grade: number | undefined): boolean {
  const pack = packs[packId];
  if (!pack || grade === undefined || packId === "custom") return true;
  return pack.years.some((y) => y.grades?.includes(grade));
}

/** The pack's year for a school grade (e.g. IB DP + grade 11 → DP1). */
export function yearForGrade(packId: string, grade: number | undefined): string | undefined {
  const pack = packs[packId];
  if (!pack || grade === undefined) return undefined;
  return pack.years.find((y) => y.grades?.includes(grade))?.id ?? (packId === "custom" ? (grade >= 13 ? "uni" : `y${Math.min(13, grade + 1)}`) : undefined);
}

export function getPack(id: string | undefined | null): CurriculumPack | undefined {
  return id ? packs[id] : undefined;
}

export type { CurriculumPack, Level, SubjectChoice, SubjectDef, ValidationIssue } from "./types";

/** Plain English name of a curriculum, sent to the AI so answers match the right syllabus. */
export function curriculumName(packId?: string | null): string | undefined {
  const names: Record<string, string> = {
    "ib-dp": "IB Diploma",
    "ib-myp": "IB Middle Years Programme",
    "ib-cp": "IB Career-related Programme",
    "american-hs": "American high school (AP)",
    cambridge: "Cambridge International (IGCSE / AS & A Level)",
    edexcel: "Pearson Edexcel International (International GCSE / IAL)",
    uk: "UK National Curriculum (GCSE / A Level / BTEC)",
    saudi: "Saudi national curriculum",
    indian: "Indian CBSE",
    french: "French Baccalauréat",
  };
  return packId ? names[packId] : undefined;
}
