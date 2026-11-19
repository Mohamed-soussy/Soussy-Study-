import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqJSON, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";
import type { SimilarProblem } from "@/lib/solver/types";
import { SIMILAR_SCHEMA } from "@/prompts/solver.v1";

export const runtime = "nodejs";

/** POST /api/solve/similar — "Try a similar one" (section 8): 3 new problems of the same type. */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;
  const b = (await req.json()) as { problem: string; topic: string; language?: string };
  try {
    const out = await groqJSON<{ problems: SimilarProblem[] }>(ROUTES.solve, {
      name: "similar",
      schema: SIMILAR_SCHEMA,
      maxTokens: 1500,
      messages: [
        {
          role: "user",
          content: `Write 3 new practice problems of the same type and difficulty as this one (topic: ${b.topic}). Each must have a single clear numerical answer (or a short list of roots). Language: ${b.language === "ar" ? "Arabic" : "English"}.\n\nOriginal:\n${(b.problem ?? "").slice(0, 2000)}`,
        },
      ],
    });
    return NextResponse.json({ problems: out.problems.slice(0, 3) });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
