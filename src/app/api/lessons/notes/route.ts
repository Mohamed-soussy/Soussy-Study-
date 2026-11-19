import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqText, ROUTES } from "@/lib/ai/engines";
import { requireEngine, requireUser } from "@/lib/ai/server";
import { MISSED_SYSTEM, SUMMARY_SYSTEM } from "@/prompts/lesson.v1";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/lessons/notes — the one-page lesson summary, or the "What I missed" brief
 * (section 11.3), made from what the analyzer already found (not the whole transcript).
 * Body: { mode: "summary" | "missed", title, subject, lessonDate, notes }
 */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await requireUser();
  if (blocked) return blocked;
  const b = (await req.json()) as { mode?: string; title?: string; subject?: string; lessonDate?: string; notes?: string };
  const notes = (b.notes ?? "").slice(0, 12000);
  if (notes.trim().length < 20) return NextResponse.json({ error: "too_short" }, { status: 400 });
  try {
    const text = await groqText(
      ROUTES.lesson,
      [
        { role: "system", content: b.mode === "missed" ? MISSED_SYSTEM : SUMMARY_SYSTEM },
        { role: "user", content: `Lesson: ${(b.title ?? "").slice(0, 120)}${b.subject ? ` (${b.subject.slice(0, 80)})` : ""}, ${b.lessonDate ?? ""}\n\n<notes>\n${notes}\n</notes>` },
      ],
      1800,
    );
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
