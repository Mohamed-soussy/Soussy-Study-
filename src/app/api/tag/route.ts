import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse, type NextRequest } from "next/server";
import { aiErrorMessage, aiNotConnected, getAnthropic, guardAi, MODELS } from "@/lib/ai/server";
import { TagSchema, tagPrompt } from "@/prompts/tag-file.v1";

export const runtime = "nodejs";

/**
 * POST /api/tag — auto-tags an uploaded file: subject, unit, topic, a 2-line
 * summary, key terms, and dated tasks for the Review tray (section 6.1).
 * Body: { fileName, text, today, subjects: [{ code, name, units }] }
 */
export async function POST(req: NextRequest) {
  const ai = getAnthropic();
  if (!ai) return aiNotConnected();
  const blocked = await guardAi();
  if (blocked) return blocked;

  const body = (await req.json()) as {
    fileName: string;
    text: string;
    today: string;
    subjects: { code: string; name: string; units: string[] }[];
  };
  // The small model reads the first ~40k characters: plenty to tag a file.
  const text = (body.text ?? "").slice(0, 40000);
  try {
    const res = await ai.messages.parse({
      model: MODELS.small,
      max_tokens: 4000,
      messages: [{ role: "user", content: tagPrompt({ ...body, text }) }],
      output_config: { format: zodOutputFormat(TagSchema) },
    });
    if (!res.parsed_output) return NextResponse.json({ error: "no_result" }, { status: 502 });
    return NextResponse.json(res.parsed_output);
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: aiErrorMessage(err) }, { status: 502 });
  }
}
