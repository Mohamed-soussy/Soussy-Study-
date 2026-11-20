import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqJSON, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";
import { FEEDBACK_SCHEMA, FEEDBACK_SYSTEM, RUBRICS, type Feedback } from "@/prompts/coach.v1";

export const runtime = "nodejs";
export const maxDuration = 90;

/** POST /api/coach/feedback — rubric feedback per criterion, an estimated band, 3 fixes (12.1). */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;
  const b = (await req.json()) as { rubric?: string; custom?: string; subject?: string; task?: string; draft?: string };
  const draft = (b.draft ?? "").slice(0, 24000);
  if (draft.trim().split(/\s+/).length < 80) return NextResponse.json({ error: "too_short", message: "Paste at least a few paragraphs." }, { status: 400 });
  const rubric = RUBRICS[b.rubric ?? ""];
  const criteria = rubric ? rubric.criteria.map((c) => `${c.name} (max ${c.max})`).join("; ") : (b.custom ?? "").slice(0, 600);
  if (!criteria) return NextResponse.json({ error: "no_rubric" }, { status: 400 });
  try {
    const out = await groqJSON<Feedback>(ROUTES.coach, {
      name: "rubric_feedback",
      schema: FEEDBACK_SCHEMA,
      maxTokens: 3000,
      effort: "medium",
      messages: [
        { role: "system", content: FEEDBACK_SYSTEM },
        { role: "user", content: `Task: ${rubric?.label ?? "Custom rubric"}${b.subject ? `, ${b.subject.slice(0, 80)}` : ""}${b.task ? `. Prompt/title: ${b.task.slice(0, 400)}` : ""}\nCriteria: ${criteria}\n\n<draft>\n${draft}\n</draft>` },
      ],
    });
    out.criteria = out.criteria.map((c) => ({ ...c, estimate: Math.max(0, Math.min(c.max, c.estimate)) }));
    out.fixes = out.fixes.slice(0, 3);
    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
