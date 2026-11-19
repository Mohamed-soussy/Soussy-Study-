import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { aiErrorMessage, aiNotConnected, getAnthropic, guardAi, MODELS } from "@/lib/ai/server";
import { CHAT_SYSTEM, chatContextBlock, type ChatContext, type ChatSource } from "@/prompts/chat.v1";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  messages: { role: "user" | "assistant"; content: string }[];
  context: ChatContext;
  sources: ChatSource[];
  justShowMe: boolean;
}

/**
 * POST /api/chat — the Study Hub tutor (section 6.2). Streams plain text.
 * The browser sends the student's context and the numbered excerpts it found
 * in their files; the model cites them as [n].
 */
export async function POST(req: NextRequest) {
  const ai = getAnthropic();
  if (!ai) return aiNotConnected();
  const blocked = await guardAi();
  if (blocked) return blocked;

  const body = (await req.json()) as Body;
  const history = (body.messages ?? []).slice(-20).filter((m) => m.content?.trim());
  if (!history.length || history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    // Stable instructions first, so they are cached across every student and turn.
    { type: "text", text: CHAT_SYSTEM, cache_control: { type: "ephemeral" } },
    { type: "text", text: chatContextBlock(body.context, (body.sources ?? []).slice(0, 12), Boolean(body.justShowMe)) },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const s = ai.beta.messages.stream({
          model: MODELS.main,
          max_tokens: 8000,
          output_config: { effort: "low" }, // chat: quick, short turns
          // If the model declines for safety reasons, the API retries on a fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        });
        for await (const event of s) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await s.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\nI can't help with that one. Try asking it a different way, or pick a study card."));
        } else if (final.stop_reason === "max_tokens") {
          controller.enqueue(encoder.encode("\n\n_(Answer cut short. Ask me to continue.)_"));
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n⚠️ ${aiErrorMessage(err)}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
