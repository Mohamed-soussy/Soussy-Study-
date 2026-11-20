import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqStream, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";
import { TEACH_SYSTEM } from "@/prompts/coach.v1";

export const runtime = "nodejs";
export const maxDuration = 90;

/** POST /api/coach/teach — teach-back mode: the student explains, "Sam" asks (Feynman method). */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const b = (await req.json()) as { topic?: string; level?: string; messages?: { role: "user" | "assistant"; content: string }[] };
  const history = (b.messages ?? []).slice(-20).filter((m) => m.content?.trim());
  // One AI use per teach-back session, counted on the first message.
  const blocked = history.filter((m) => m.role === "user").length <= 1 ? await guardAi() : null;
  if (blocked) return blocked;
  if (!b.topic || !history.length) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      try {
        for await (const d of groqStream(ROUTES.coach, [{ role: "system", content: TEACH_SYSTEM(b.topic!.slice(0, 120), (b.level ?? "").slice(0, 60)) }, ...history], 900)) c.enqueue(enc.encode(d));
      } catch (err) {
        c.enqueue(enc.encode(`\n\n⚠️ ${engineErrorMessage(err)}`));
      } finally {
        c.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
