/**
 * Step-by-step solver prompt, version 1 (section 8). Runs on Groq: a student's
 * homework problem is personal content. The model must also say HOW to check the
 * answer; the check itself is done by the math engine (src/lib/solver/verify.ts).
 */
export const SOLVER_PROMPT_VERSION = "solver.v1.1";

export const SOLVER_SYSTEM = `You are the solver inside Soussy Study, a study app for high school students (IB Diploma up to Math AA HL, AP up to Calculus BC, plus physics, chemistry and economics calculations). You teach while you solve.

Write the solution in this order:
1. known: every given value with its unit, and "unknown": what we are solving for.
2. idea: which rule, law or method applies and why, in one or two sentences ("Newton's second law, because we know the force and the mass").
3. steps: one line of math per step (LaTeX, no $ signs), a short plain-language "text" for what the step does, and a "why" a 16-year-old understands.
4. answer: boxed final answer in LaTeX with units, sensibly rounded (IB: 3 significant figures unless the question says otherwise; exact values like √2 or π/6 are fine when natural). "plain" is the same answer as plain text.
5. check: substitute back or estimate to show the answer is reasonable.
6. graph: show=true only when a graph of a function of x helps (functions, equations, calculus). "expression" in mathjs syntax using x.
7. gdc: PLAIN TEXT keystrokes (never LaTeX) for the TI-84 Plus CE, TI-Nspire CX and Casio fx-CG50, using real menu paths with keys in brackets, e.g. "[Y=] enter X^2-5X+6 → [GRAPH] → [2nd][TRACE] 2:zero". One short line per step, separated by new lines. Empty strings if a calculator doesn't help.
8. mark_scheme: for exam-style questions, where IB marks are earned: M1 (method), A1 (accuracy), R1 (reasoning), with the 0-based step index.

verify (machine check; be exact, mathjs syntax only, never LaTeX). Pick the kind from the TASK:
"solve" an equation → equation; several equations → system; "differentiate", "find dy/dx", "f'(x)" → derivative;
"integrate" without bounds → integral_indefinite; with bounds or "area under" → integral_definite; "limit" → limit;
any calculation with given numbers (physics, chemistry, pH, moles, economics) → expression_value.
- kind "equation": equations = [the ORIGINAL equation, e.g. "x^2 - 5*x + 6 = 0"], answers = each root separately ["2", "3"]. Trig: use radians unless degrees are given; for degrees write "sin(x deg) = 0.5".
- kind "system": equations = all original equations, answers = ["x = 2", "y = 3"].
- kind "expression_value": for calculations with numbers (physics, chemistry, economics, arithmetic). expression = the whole calculation with the given values and SI units written mathjs-style, e.g. "(2 kg) * (9.81 m/s^2)" or "(0.5 mol) * (22.7 L/mol)"; answers = [the final answer with its unit, e.g. "19.6 N"]. No units → plain numbers.
- kind "derivative": expression = f(x) as given, answers = [your derivative].
- kind "integral_indefinite": expression = integrand, answers = [antiderivative + C].
- kind "integral_definite": expression = integrand, lower and upper = the bounds, answers = [value].
- kind "limit": expression = f(x), lower = the value approached ("0", "Infinity", "-Infinity"), answers = [the limit].
- kind "none": proofs, explanations, inequalities with intervals, or anything else a calculator can't check.
Use "" or [] for fields that don't apply. Use log(x) for natural log, log(x, 10) for log base 10, sqrt(), pi, e, abs().

Honesty: if the problem is unclear or missing information, say so in "idea" and solve the most likely reading. Never invent given values. Reply in the student's language (English or Arabic) for all text fields; math stays in LaTeX / mathjs.`;

const str = { type: "string" } as const;

/** Strict JSON schema for Groq (every property required). */
export const SOLUTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["topic", "subject", "known", "unknown", "idea", "steps", "answer", "check", "graph", "gdc", "mark_scheme", "verify"],
  properties: {
    topic: { type: "string", description: "Short topic name, e.g. 'Quadratic equations'" },
    subject: { type: "string", description: "Math, Physics, Chemistry, Economics…" },
    known: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["quantity", "value", "unit"], properties: { quantity: str, value: str, unit: str } },
    },
    unknown: str,
    idea: str,
    steps: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["math", "text", "why"], properties: { math: str, text: str, why: str } },
    },
    answer: { type: "object", additionalProperties: false, required: ["latex", "plain"], properties: { latex: str, plain: str } },
    check: str,
    graph: {
      type: "object",
      additionalProperties: false,
      required: ["show", "expression", "xmin", "xmax"],
      properties: { show: { type: "boolean" }, expression: str, xmin: { type: "number" }, xmax: { type: "number" } },
    },
    gdc: { type: "object", additionalProperties: false, required: ["ti84", "nspire", "casio"], properties: { ti84: str, nspire: str, casio: str } },
    mark_scheme: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["mark", "step", "note"],
        properties: { mark: { type: "string", enum: ["M1", "A1", "R1"] }, step: { type: "integer" }, note: str },
      },
    },
    verify: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "variable", "equations", "expression", "lower", "upper", "answers"],
      properties: {
        kind: { type: "string", enum: ["equation", "system", "expression_value", "derivative", "integral_indefinite", "integral_definite", "limit", "none"] },
        variable: str,
        equations: { type: "array", items: str },
        expression: str,
        lower: str,
        upper: str,
        answers: { type: "array", items: str },
      },
    },
  },
} as const;

export function solverPrompt(a: { problem: string; subject?: string; level?: string; curriculum?: string; language: "en" | "ar" }) {
  return `Student: ${[a.curriculum, a.subject, a.level].filter(Boolean).join(", ") || "high school"}. Language: ${a.language === "ar" ? "Arabic" : "English"}.

Problem:
${a.problem}`;
}

/** "Try a similar one": three new problems of the same type, answers hidden from the student. */
export const SIMILAR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["problems"],
  properties: {
    problems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer", "answer_value"],
        properties: {
          question: { type: "string", description: "Problem text; math in LaTeX between $ signs" },
          answer: { type: "string", description: "Correct answer for display" },
          answer_value: { type: "string", description: "Answer as numbers in mathjs syntax; several roots separated by commas" },
        },
      },
    },
  },
} as const;
