import { all, create, type MathNode } from "mathjs";

/**
 * Independent answer checking for the solver (section 8, accuracy rule):
 * "never trust the language model alone for arithmetic". The AI says WHAT to check
 * (the original equation, the function, the formula with values); this file does the
 * maths itself with mathjs and decides whether the claimed answer is right.
 */
const math = create(all, { number: "number" });

export type VerifyKind =
  | "equation"
  | "system"
  | "expression_value"
  | "derivative"
  | "integral_indefinite"
  | "integral_definite"
  | "limit"
  | "none";

export interface VerifySpec {
  kind: VerifyKind;
  /** Main variable, e.g. "x". */
  variable: string;
  /** For equation/system: equations in mathjs syntax, e.g. "2*x + 1 = 7". */
  equations: string[];
  /** For derivative/integral/limit: f(variable). For expression_value: the full calculation, units allowed. */
  expression: string;
  /** Bounds for definite integrals; the approached value for limits ("0", "Infinity"). */
  lower: string;
  upper: string;
  /** Claimed answers in mathjs syntax. Equations: one value per root. System: "x = 2" entries. Units allowed. */
  answers: string[];
}

export interface VerifyResult {
  status: "verified" | "failed" | "not_checkable";
  /** Short plain-language note, e.g. "x = 3 makes both sides equal 7". */
  detail: string;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Tidies common AI habits into mathjs syntax. */
export function normalize(expr: string): string {
  return expr
    .replace(/\\cdot|×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/π/g, "pi")
    .replace(/√\s*\(?([^)\s]+)\)?/g, "sqrt($1)")
    .replace(/\*\*/g, "^")
    .replace(/\bln\(/g, "log(")
    .replace(/(\d)\s*°/g, "$1 deg")
    .trim();
}

function num(expr: string, scope: Record<string, number> = {}): number {
  const v = math.evaluate(normalize(expr), { ...scope });
  if (isNum(v)) return v;
  if (v && typeof v === "object" && "re" in v && Math.abs((v as { im: number }).im) < 1e-12) return (v as { re: number }).re;
  throw new Error("not a real number");
}

/** How many decimal places / significant figures the student-facing answer was rounded to. */
function roundingTolerance(answer: string, value: number): number {
  const m = normalize(answer).match(/-?\d*\.?\d+(?:e-?\d+)?/i);
  const rel = 0.006 * Math.abs(value); // 3 significant figures (IB default) → within ~0.5%
  if (!m) return Math.max(rel, 1e-9);
  const dec = (m[0].split(".")[1] ?? "").replace(/e.*/i, "").length;
  const abs = 0.51 * 10 ** -dec;
  return Math.max(abs, rel, 1e-9);
}

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

function samplePoints(n = 7): number[] {
  return [0.37, 1.21, 2.53, -0.83, -1.67, 3.11, 0.71].slice(0, n);
}

/** One root claim: plug it in, or (for rounded answers) look for a sign change nearby. */
function rootHolds(lhs: MathNode, rhs: MathNode, v: string, a: number, answerText: string): boolean {
  const g = (x: number) => {
    const L = lhs.evaluate({ [v]: x });
    const R = rhs.evaluate({ [v]: x });
    return Number(L) - Number(R);
  };
  const scale = Math.max(1, Math.abs(Number(rhs.evaluate({ [v]: a }))), Math.abs(Number(lhs.evaluate({ [v]: a }))));
  const r = g(a);
  if (isNum(r) && Math.abs(r) <= 1e-7 * scale) return true;
  const tol = roundingTolerance(answerText, a);
  const lo = g(a - tol);
  const hi = g(a + tol);
  if (isNum(lo) && isNum(hi) && (lo === 0 || hi === 0 || Math.sign(lo) !== Math.sign(hi))) return true;
  // Double roots don't change sign: accept a tiny minimum in the interval.
  let best = Infinity;
  for (let k = 0; k <= 40; k++) {
    const val = g(a - tol + (2 * tol * k) / 40);
    if (isNum(val)) best = Math.min(best, Math.abs(val));
  }
  return best <= 1e-6 * scale;
}

function splitEquation(eq: string): [MathNode, MathNode] {
  const parts = normalize(eq).split(/(?<![<>!=])=(?!=)/);
  if (parts.length !== 2) throw new Error(`not an equation: ${eq}`);
  return [math.parse(parts[0]), math.parse(parts[1])];
}

/** Integrates f numerically on [a, b] with Simpson's rule. */
function simpson(f: (x: number) => number, a: number, b: number, n = 2000): number {
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}

export function verify(spec: VerifySpec): VerifyResult {
  const v = (spec.variable || "x").trim();
  const answers = spec.answers.map((a) => a.trim()).filter(Boolean);
  try {
    switch (spec.kind) {
      case "equation": {
        if (!answers.length || !spec.equations.length) return { status: "not_checkable", detail: "No answer to check." };
        const [lhs, rhs] = splitEquation(spec.equations[0]);
        const bad: string[] = [];
        for (const a of answers) {
          const value = num(a.replace(new RegExp(`^${v}\\s*=`), ""));
          if (!rootHolds(lhs, rhs, v, value, a)) bad.push(a);
        }
        return bad.length
          ? { status: "failed", detail: `${bad.join(", ")} does not satisfy ${spec.equations[0]}.` }
          : { status: "verified", detail: `Substituting ${answers.join(", ")} back into ${spec.equations[0]} makes both sides equal.` };
      }

      case "system": {
        const scope: Record<string, number> = {};
        for (const a of answers) {
          const [name, val] = a.split("=").map((s) => s.trim());
          if (!name || !val) return { status: "not_checkable", detail: "Answers must look like x = 2." };
          scope[name] = num(val);
        }
        for (const eq of spec.equations) {
          const [lhs, rhs] = splitEquation(eq);
          const L = Number(lhs.evaluate(scope));
          const R = Number(rhs.evaluate(scope));
          const tol = Math.max(...answers.map((a) => roundingTolerance(a, scope[a.split("=")[0].trim()] ?? 1))) * 20;
          if (!close(L, R, Math.max(tol, 1e-7 * Math.max(1, Math.abs(R))))) return { status: "failed", detail: `${answers.join(", ")} does not satisfy ${eq}.` };
        }
        return { status: "verified", detail: `${answers.join(", ")} satisfies every equation.` };
      }

      case "expression_value": {
        if (!answers.length || !spec.expression) return { status: "not_checkable", detail: "No calculation to check." };
        const computed = math.evaluate(normalize(spec.expression));
        const claimed = math.evaluate(normalize(answers[0]));
        const isUnit = (x: unknown) => typeof x === "object" && x !== null && (x as { type?: string }).type === "Unit";
        let c: number;
        let k: number;
        if (isUnit(computed) || isUnit(claimed)) {
          if (!(isUnit(computed) && isUnit(claimed))) return { status: "failed", detail: "The units don't match the calculation." };
          const cu = computed as math.Unit;
          const ku = claimed as math.Unit;
          if (!cu.equalBase(ku)) return { status: "failed", detail: `Units don't match: ${cu.formatUnits()} vs ${ku.formatUnits()}.` };
          const unit = ku.formatUnits();
          c = cu.toNumber(unit);
          k = ku.toNumber(unit);
        } else {
          c = num(String(computed));
          k = Number(claimed);
        }
        const ok = close(c, k, roundingTolerance(answers[0], k));
        return ok
          ? { status: "verified", detail: `Recalculated ${spec.expression} = ${math.format(c, { precision: 6 })}, which rounds to the answer.` }
          : { status: "failed", detail: `Recalculating gives ${math.format(c, { precision: 6 })}, not ${answers[0]}.` };
      }

      case "derivative": {
        const f = math.parse(normalize(spec.expression));
        const claimed = math.parse(normalize(answers[0] ?? ""));
        const exact = math.derivative(f, v);
        let checked = 0;
        for (const x of samplePoints()) {
          const want = Number(exact.evaluate({ [v]: x }));
          const got = Number(claimed.evaluate({ [v]: x }));
          if (!isNum(want) || !isNum(got)) continue;
          if (!close(want, got, 1e-6 * Math.max(1, Math.abs(want)))) return { status: "failed", detail: `At ${v} = ${x} the derivative is ${want.toPrecision(5)}, not ${got.toPrecision(5)}.` };
          checked++;
        }
        return checked >= 3
          ? { status: "verified", detail: `Matches the derivative of ${spec.expression} at ${checked} test points.` }
          : { status: "not_checkable", detail: "Couldn't test enough points." };
      }

      case "integral_indefinite": {
        const f = math.parse(normalize(spec.expression));
        const F = math.parse(normalize((answers[0] ?? "").replace(/\+\s*C\s*$/i, "")));
        const dF = math.derivative(F, v);
        let checked = 0;
        for (const x of samplePoints()) {
          const want = Number(f.evaluate({ [v]: x }));
          const got = Number(dF.evaluate({ [v]: x }));
          if (!isNum(want) || !isNum(got)) continue;
          if (!close(want, got, 1e-6 * Math.max(1, Math.abs(want)))) return { status: "failed", detail: `Differentiating the answer doesn't give back ${spec.expression}.` };
          checked++;
        }
        return checked >= 3
          ? { status: "verified", detail: `Differentiating the answer gives back ${spec.expression}.` }
          : { status: "not_checkable", detail: "Couldn't test enough points." };
      }

      case "integral_definite": {
        const f = math.compile(normalize(spec.expression));
        const a = num(spec.lower);
        const b = num(spec.upper);
        const value = simpson((x) => Number(f.evaluate({ [v]: x })), a, b);
        const claimed = num(answers[0] ?? "NaN");
        return isNum(value) && close(value, claimed, roundingTolerance(answers[0], claimed))
          ? { status: "verified", detail: `Numerical integration gives ${value.toPrecision(6)}.` }
          : { status: "failed", detail: `Numerical integration gives ${value.toPrecision(6)}, not ${answers[0]}.` };
      }

      case "limit": {
        const f = math.compile(normalize(spec.expression));
        const target = spec.lower.trim();
        const claimedText = answers[0] ?? "";
        const evalAt = (x: number) => Number(f.evaluate({ [v]: x }));
        let approx: number[];
        if (/^-?inf/i.test(target)) {
          const s = target.startsWith("-") ? -1 : 1;
          approx = [1e6, 1e7].map((x) => evalAt(s * x));
        } else {
          const t = num(target);
          approx = [1e-6, -1e-6, 1e-7, -1e-7].map((h) => evalAt(t + h));
        }
        if (/^-?inf/i.test(claimedText)) {
          const sign = claimedText.startsWith("-") ? -1 : 1;
          return approx.every((y) => Math.sign(y) === sign && Math.abs(y) > 1e4)
            ? { status: "verified", detail: "The function grows without bound there." }
            : { status: "failed", detail: "The function doesn't grow without bound there." };
        }
        const claimed = num(claimedText);
        const ok = approx.every((y) => isNum(y) && close(y, claimed, Math.max(roundingTolerance(claimedText, claimed), 1e-4)));
        return ok
          ? { status: "verified", detail: `Values of the function approach ${claimedText} from both sides.` }
          : { status: "failed", detail: `Near ${target} the function is about ${approx[0]?.toPrecision(5)}, not ${claimedText}.` };
      }

      default:
        return { status: "not_checkable", detail: "This kind of answer can't be checked by the math engine." };
    }
  } catch (err) {
    return { status: "not_checkable", detail: `The math engine couldn't read it (${err instanceof Error ? err.message.slice(0, 80) : "error"}).` };
  }
}

/** Compares a student's typed answer with the correct one (for "Try a similar one"). */
export function sameAnswer(given: string, correct: string): boolean {
  try {
    const parse = (s: string) => s.split(/[,;]|\bor\b|\band\b/).map((x) => x.replace(/^[a-z]\s*=/i, "").trim()).filter(Boolean);
    const g = parse(given).map((x) => num(x)).sort((a, b) => a - b);
    const c = parse(correct).map((x) => num(x)).sort((a, b) => a - b);
    return g.length === c.length && g.every((x, i) => close(x, c[i], Math.max(0.006 * Math.abs(c[i]), 0.011)));
  } catch {
    return given.trim().toLowerCase() === correct.trim().toLowerCase();
  }
}

export { math };
