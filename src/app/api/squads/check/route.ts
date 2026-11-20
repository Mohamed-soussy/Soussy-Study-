import { NextResponse, type NextRequest } from "next/server";
import { engineConfigured, groqJSON, ROUTES } from "@/lib/ai/engines";
import { requireUser } from "@/lib/ai/server";

export const runtime = "nodejs";
export const maxDuration = 20;

/** Phone numbers, emails, Saudi IDs, and links: never in group chat (section 14). */
const BLOCK = /\b(?:\+?966|0)5\d{8}\b|\b[\w.+-]+@[\w-]+\.[\w.]+\b|\b[12]\d{9}\b|https?:\/\/|www\./i;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "reason"],
  properties: { ok: { type: "boolean" }, reason: { type: "string", enum: ["fine", "bullying", "sexual", "hate", "self_harm", "cheating", "personal", "spam"] } },
} as const;

/**
 * POST /api/squads/check — AI moderation for every Squad chat message before it's posted
 * (section 14). Body: { text }. Returns { ok, reason }.
 */
export async function POST(req: NextRequest) {
  const blocked = await requireUser();
  if (blocked) return blocked;
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const body = (text ?? "").slice(0, 1000);
  if (!body.trim()) return NextResponse.json({ ok: false, reason: "spam" });
  if (BLOCK.test(body)) return NextResponse.json({ ok: false, reason: "personal" });
  if (!engineConfigured("groq")) return NextResponse.json({ ok: true, reason: "fine" });
  try {
    const out = await groqJSON<{ ok: boolean; reason: string }>(ROUTES.community, {
      name: "chat_check",
      schema: SCHEMA,
      maxTokens: 120,
      messages: [
        {
          role: "system",
          content:
            "You moderate a school study group chat for teenagers. ok=false only for bullying or insults aimed at someone, sexual content, hate, self-harm encouragement, cheating services (selling answers, leaking exams), sharing personal information, or spam. Normal study talk, jokes, slang, Arabic and English are fine. reason is 'fine' when ok.",
        },
        { role: "user", content: body },
      ],
    });
    return NextResponse.json(out);
  } catch {
    // If the check is down, the message still goes through; the Report button stays.
    return NextResponse.json({ ok: true, reason: "fine" });
  }
}
