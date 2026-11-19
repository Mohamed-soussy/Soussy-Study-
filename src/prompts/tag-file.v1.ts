import { z } from "zod";

/** Auto-tagging an uploaded file (section 6.1), version 1. Runs on the small model. */
export const TAG_PROMPT_VERSION = "tag-file.v1";

export const TagSchema = z.object({
  subject_code: z.string().nullable().describe("One of the given subject codes, or null if none fits"),
  unit: z.string().nullable().describe("Unit name, preferring one from the given unit list"),
  topic: z.string().nullable().describe("Short topic name, 2–6 words"),
  summary: z.string().describe("Exactly 2 short lines describing what the file covers"),
  key_terms: z.array(z.string()).describe("Up to 12 key terms that appear in the file"),
  tasks: z
    .array(
      z.object({
        title: z.string().describe("Short task title, e.g. 'Physics test: Doppler effect'"),
        type: z.enum(["test", "homework", "submission", "event"]),
        date: z.string().describe("YYYY-MM-DD"),
        quote: z.string().describe("The exact words in the file that mention it"),
        confidence: z.number().describe("0 to 1"),
      }),
    )
    .describe("Dated deadlines, tests or events the file mentions; empty if none"),
});

export type TagResult = z.infer<typeof TagSchema>;

export function tagPrompt(args: {
  fileName: string;
  text: string;
  today: string;
  subjects: { code: string; name: string; units: string[] }[];
}): string {
  const subjects = args.subjects
    .map((s) => `- ${s.code}: ${s.name}${s.units.length ? ` (units: ${s.units.join("; ")})` : ""}`)
    .join("\n");
  return `Tag this study file for a high school student. Today is ${args.today}.

The student's subjects (use these codes):
${subjects || "- none"}

File name: ${args.fileName}

Rules:
- Pick the subject only if the content clearly matches; otherwise null.
- The summary is two short lines a student can scan.
- Only list tasks with a real date written in the file. Convert relative dates using today's date. Never invent dates.
- Key terms must appear in the text.

<file_text>
${args.text}
</file_text>`;
}
