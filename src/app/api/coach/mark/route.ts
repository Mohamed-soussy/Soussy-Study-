import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqJSON, ROUTES } from "@/lib/ai/engines";
import { requireEngine, requireUser } from "@/lib/ai/server";
import { MARK_SCHEMA, MARK_SYSTEM } from "@/prompts/coach.v1";

export const runtime = "nodejs";
export const maxDuration = 90;

/** POST /api/coach/mark — marks written answers against the generated markscheme (estimate). */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await requireUser();
  if (blocked) return blocked;
  const b = (await req.json()) as { items?: { n: number; prompt: string; marks: number; markscheme: string; answer: string }[] };
  const items = (b.items ?? []).slice(0, 30);
  if (!items.length) return NextResponse.json({ results: [] });
  try {
    const out = await groqJSON<{ results: { n: number; awarded: number; feedback: string }[] }>(ROUTES.coach, {
      name: "marking",
      schema: MARK_SCHEMA,
      maxTokens: 3500,
      messages: [
        { role: "system", content: MARK_SYSTEM },
        {
          role: "user",
          content: items
            .map((i) => `Question ${i.n} [${i.marks} marks]: ${i.prompt.slice(0, 800)}\nMarkscheme:\n${i.markscheme.slice(0, 800)}\nStudent's answer:\n${(i.answer || "(no answer)").slice(0, 2500)}`)
            .join("\n\n---\n\n"),
        },
      ],
    });
    const max = new Map(items.map((i) => [i.n, i.marks]));
    return NextResponse.json({ results: out.results.map((r) => ({ ...r, awarded: Math.max(0, Math.min(max.get(r.n) ?? 0, Math.round(r.awarded * 2) / 2)) })) });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
