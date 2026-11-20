import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqText, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";
import { CORE_TASKS, type CoreTask } from "@/prompts/coach.v1";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/coach/core — IB Core and college-prep helpers (section 12.2). Body: { task, input } */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;
  const b = (await req.json()) as { task?: string; input?: string };
  const task = b.task as CoreTask;
  const input = (b.input ?? "").trim().slice(0, 3000);
  if (!(task in CORE_TASKS) || input.length < 3) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    return NextResponse.json({ text: await groqText(ROUTES.coach, [{ role: "user", content: CORE_TASKS[task](input) }], 2000) });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
