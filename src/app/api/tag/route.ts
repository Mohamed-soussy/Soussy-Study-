import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqJSON, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";
import { TAG_SCHEMA, tagPrompt, type TagResult } from "@/prompts/tag-file.v1";

export const runtime = "nodejs";

/**
 * POST /api/tag — auto-tags an uploaded file: subject, unit, topic, a 2-line
 * summary, key terms, and dated tasks for the Review tray (section 6.1).
 * The student's own file, so it runs on Groq.
 */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;

  const body = (await req.json()) as {
    fileName: string;
    text: string;
    today: string;
    subjects: { code: string; name: string; units: string[] }[];
  };
  const text = (body.text ?? "").slice(0, 30000);
  try {
    const result = await groqJSON<TagResult>(ROUTES.tagFile, {
      name: "file_tags",
      schema: TAG_SCHEMA,
      messages: [{ role: "user", content: tagPrompt({ ...body, text }) }],
      maxTokens: 1500,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
