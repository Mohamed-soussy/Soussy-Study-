import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqStream, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";
import { CHAT_SYSTEM, chatContextBlock, type ChatContext, type ChatSource } from "@/prompts/chat.v1";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Body {
  messages: { role: "user" | "assistant"; content: string }[];
  context: ChatContext;
  sources: ChatSource[];
  justShowMe: boolean;
}

/**
 * POST /api/chat — the Study Hub tutor (section 6.2). Streams plain text.
 * Personal content (the student's words and files), so it runs on Groq, never on the Gemini free tier.
 */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;

  const body = (await req.json()) as Body;
  const history = (body.messages ?? []).slice(-20).filter((m) => m.content?.trim());
  if (!history.length || history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const system = `${CHAT_SYSTEM}\n\n${chatContextBlock(body.context, (body.sources ?? []).slice(0, 12), Boolean(body.justShowMe))}`;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of groqStream(ROUTES.chat, [{ role: "system", content: system }, ...history], 4000)) {
          controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n⚠️ ${engineErrorMessage(err)}`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
