import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqJSON, groqText, ROUTES, type GroqMessage } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";
import type { SolveResponse, Solution } from "@/lib/solver/types";
import { verify } from "@/lib/solver/verify";
import { SOLUTION_SCHEMA, SOLVER_SYSTEM, solverPrompt } from "@/prompts/solver.v1";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/solve — step-by-step solver (section 8).
 * Body: { problem?, image? (base64 JPEG/PNG), mime?, subject?, level?, curriculum?, language }
 * 1. A photo is read by Groq's vision model (personal content stays off the Gemini free tier).
 * 2. Groq solves it and says how to check the answer.
 * 3. The math engine checks it. If the check fails, Groq re-solves once with the reason;
 *    if it still fails, the answer is marked "uncertain" instead of being shown as right.
 */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;

  const b = (await req.json()) as { problem?: string; image?: string; mime?: string; subject?: string; level?: string; curriculum?: string; language?: string };
  const language = b.language === "ar" ? "ar" : "en";
  let problem = (b.problem ?? "").trim().slice(0, 4000);

  try {
    if (b.image) {
      if (b.image.length > 6_000_000 || !/^[A-Za-z0-9+/=]+$/.test(b.image)) return NextResponse.json({ error: "bad_image" }, { status: 400 });
      const mime = ["image/png", "image/jpeg", "image/webp"].includes(b.mime ?? "") ? b.mime : "image/jpeg";
      const read = await groqText(
        ROUTES.readImage,
        [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Transcribe the math, physics or chemistry problem in this image exactly (handwriting or print, English or Arabic). Write math in LaTeX. Output only the problem.",
              },
              { type: "image_url", image_url: { url: `data:${mime};base64,${b.image}` } },
            ],
          },
        ],
        1200,
      );
      problem = `${read}${problem ? `\n\n${problem}` : ""}`.trim();
    }
    if (problem.length < 2) return NextResponse.json({ error: "no_problem" }, { status: 400 });

    const messages: GroqMessage[] = [
      { role: "system", content: SOLVER_SYSTEM },
      { role: "user", content: solverPrompt({ problem, subject: b.subject, level: b.level, curriculum: b.curriculum, language }) },
    ];
    let solution = await groqJSON<Solution>(ROUTES.solve, { messages, schema: SOLUTION_SCHEMA, name: "solution", maxTokens: 3000, effort: "medium" });
    let result = verify(solution.verify);
    let attempts = 1;

    // Re-solve once if the answer is wrong, or if the check couldn't read it.
    if (result.status === "failed" || (result.status === "not_checkable" && solution.verify.kind !== "none")) {
      attempts = 2;
      const retry = await groqJSON<Solution>(ROUTES.solve, {
        messages: [
          ...messages,
          { role: "assistant", content: JSON.stringify(solution) },
          {
            role: "user",
            content:
              result.status === "failed"
                ? `A math engine checked your answer and it is wrong: ${result.detail} Solve the problem again carefully from the start, fix the mistake, and give the corrected verify block.`
                : `The math engine couldn't check your answer: ${result.detail} Re-check the verify block: choose the right kind for the task and write every field in plain mathjs syntax.`,
          },
        ],
        schema: SOLUTION_SCHEMA,
        name: "solution",
        maxTokens: 3000,
        effort: "medium",
      });
      const second = verify(retry.verify);
      if (second.status === "verified" || (second.status === "not_checkable" && result.status === "failed")) {
        solution = retry;
        result = second;
      }
    }

    const body: SolveResponse = { problem, solution, verification: { ...result, attempts } };
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
