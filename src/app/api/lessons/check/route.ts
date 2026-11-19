import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, EngineError, groqJSON, ROUTES } from "@/lib/ai/engines";
import { requireEngine, requireUser } from "@/lib/ai/server";
import { CHECK_SCHEMA, CHECK_SYSTEM, type CheckOut } from "@/prompts/lesson.v1";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/lessons/check — a second, focused look at short snippets that sound like the
 * teacher setting work, when the first pass found nothing there (so nothing is missed).
 * Body: { lessonDate, weekday, snippets: string[] } (each a few timed lines).
 */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await requireUser();
  if (blocked) return blocked;
  const b = (await req.json()) as { lessonDate?: string; weekday?: string; snippets?: string[] };
  const snippets = (b.snippets ?? []).slice(0, 20).map((s) => s.slice(0, 900));
  if (!snippets.length) return NextResponse.json({ results: [] });
  try {
    const out = await groqJSON<CheckOut>(ROUTES.lesson, {
      name: "lesson_check",
      schema: CHECK_SCHEMA,
      maxTokens: 2500,
      effort: "medium",
      messages: [
        { role: "system", content: CHECK_SYSTEM },
        { role: "user", content: `Lesson date: ${b.lessonDate ?? ""} (${b.weekday ?? ""}).\n\n${snippets.map((s, i) => `<snippet n="${i + 1}">\n${s}\n</snippet>`).join("\n\n")}` },
      ],
    });
    return NextResponse.json(out);
  } catch (err) {
    const status = err instanceof EngineError && err.code === "rate_limited" ? 429 : 502;
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err), retryAfter: err instanceof EngineError ? err.retryAfter : 0 }, { status });
  }
}
