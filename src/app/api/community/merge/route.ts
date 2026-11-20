import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqText, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";
import { MERGE_SYSTEM } from "@/prompts/resources.v1";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/community/merge — "Merge the top 3" into one master summary with citations (9.2). */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;
  const b = (await req.json()) as { unit?: string; notes?: { title: string; body: string }[] };
  const notes = (b.notes ?? []).slice(0, 3);
  if (notes.length < 2) return NextResponse.json({ error: "too_few" }, { status: 400 });
  try {
    const text = await groqText(
      ROUTES.community,
      [
        { role: "system", content: MERGE_SYSTEM },
        { role: "user", content: `Unit: ${(b.unit ?? "").slice(0, 120)}\n\n${notes.map((n, i) => `[${i + 1}] ${n.title}\n${n.body.slice(0, 6000)}`).join("\n\n---\n\n")}` },
      ],
      2200,
    );
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
