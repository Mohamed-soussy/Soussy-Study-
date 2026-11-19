import { americanHighSchool } from "./packs/american-hs";
import { customPack } from "./packs/custom";
import { ibDiploma } from "./packs/ib-dp";
import type { CurriculumPack } from "./types";

export const packs: Record<string, CurriculumPack> = {
  [ibDiploma.id]: ibDiploma,
  [americanHighSchool.id]: americanHighSchool,
  [customPack.id]: customPack,
};

/**
 * Curriculum cards shown in onboarding (section 3A families).
 * `packId` is the pack that powers the card; families without a finished
 * pack use "custom" and are labeled so the student knows.
 */
export const curriculumCards: { id: string; packId: string; ready: boolean }[] = [
  { id: "ib", packId: "ib-dp", ready: true },
  { id: "american", packId: "american-hs", ready: true },
  { id: "cambridge", packId: "custom", ready: false },
  { id: "edexcel", packId: "custom", ready: false },
  { id: "uk", packId: "custom", ready: false },
  { id: "saudi", packId: "custom", ready: false },
  { id: "indian", packId: "custom", ready: false },
  { id: "french", packId: "custom", ready: false },
  { id: "own", packId: "custom", ready: true },
];

export function getPack(id: string | undefined | null): CurriculumPack | undefined {
  return id ? packs[id] : undefined;
}

export type { CurriculumPack, Level, SubjectChoice, SubjectDef, ValidationIssue } from "./types";
