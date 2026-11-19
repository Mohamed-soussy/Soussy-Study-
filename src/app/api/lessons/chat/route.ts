import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqStream, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";
import { LESSON_CHAT_SYSTEM } from "@/prompts/lesson.v1";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * POST /api/lessons/chat — "Chat with the lesson" (section 11.3): answers with timestamped
 * quotes. Body: { title, messages: [{role, content}], excerpts: "[mm:ss] text" lines }
 */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;
  const b = (await req.json()) as { title?: string; messages?: { role: "user" | "assistant"; content: string }[]; excerpts?: string };
  const history = (b.messages ?? []).slice(-10).filter((m) => m.content?.trim());
  if (!history.length || history[history.length - 1].role !== "user") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const system = `${LESSON_CHAT_SYSTEM}\n\nLesson: ${(b.title ?? "").slice(0, 120)}\n\n<excerpts>\n${(b.excerpts ?? "").slice(0, 14000)}\n</excerpts>`;
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const d of groqStream(ROUTES.lesson, [{ role: "system", content: system }, ...history], 1200)) controller.enqueue(enc.encode(d));
      } catch (err) {
        controller.enqueue(enc.encode(`\n\n⚠️ ${engineErrorMessage(err)}`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
