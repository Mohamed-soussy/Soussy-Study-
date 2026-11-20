import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqJSON, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";
import { extractFile } from "@/lib/extract";

export const runtime = "nodejs";
export const maxDuration = 90;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rows"],
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["subject", "topic", "score", "total"],
        properties: { subject: { type: "string" }, topic: { type: "string" }, score: { type: "number" }, total: { type: "number" } },
      },
    },
  },
} as const;

/**
 * POST /api/progress/report — reads a score report (Cognia, MAP, a school test report: PDF
 * or screenshot) and returns scores by topic, so weak topics show on the Progress page
 * (section 10.3, "Cognia note"). Form: file. The student's own results, so Groq.
 */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "bad_file", message: "Upload a PDF or a screenshot under 8 MB." }, { status: 400 });
  try {
    const ex = await extractFile(Buffer.from(await file.arrayBuffer()), file.name, file.type);
    const text = ex.pages.join("\n\n").slice(0, 12000);
    if (text.trim().length < 20) return NextResponse.json({ error: "unreadable", message: "Couldn't read that report. Try a clearer screenshot." }, { status: 422 });
    const out = await groqJSON<{ rows: { subject: string; topic: string; score: number; total: number }[] }>(ROUTES.coach, {
      name: "score_report",
      schema: SCHEMA,
      maxTokens: 1800,
      messages: [
        {
          role: "user",
          content: `This is a student's test score report. List every topic, strand or skill that has a score. For each: subject, topic (the strand or skill name as written), score and total, as numbers (a percentage like 64% is score 64, total 100; a RIT or scale score without a maximum is skipped). Use only what the report says.\n\n<report>\n${text}\n</report>`,
        },
      ],
    });
    return NextResponse.json({ rows: out.rows.filter((r) => r.topic && r.total > 0 && r.score >= 0 && r.score <= r.total).slice(0, 40) });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
