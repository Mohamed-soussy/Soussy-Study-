import type { VerifyResult, VerifySpec } from "./verify";

/** A solved problem, as returned by /api/solve. */
export interface Solution {
  topic: string;
  subject: string;
  known: { quantity: string; value: string; unit: string }[];
  unknown: string;
  idea: string;
  /** Every formula used, with what each symbol means (older saved solutions may not have it). */
  formulas?: { name: string; latex: string; meaning: string }[];
  steps: { math: string; text: string; why: string }[];
  answer: { latex: string; plain: string };
  check: string;
  graph: { show: boolean; expression: string; xmin: number; xmax: number };
  gdc: { ti84: string; nspire: string; casio: string };
  mark_scheme: { mark: "M1" | "A1" | "R1"; step: number; note: string }[];
  verify: VerifySpec;
}

export interface SolveResponse {
  problem: string;
  solution: Solution;
  verification: VerifyResult & { attempts: number };
}

export interface SimilarProblem {
  question: string;
  answer: string;
  answer_value: string;
}
