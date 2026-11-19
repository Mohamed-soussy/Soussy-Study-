/** Auto-tagging an uploaded file (section 6.1), version 1. Runs on Groq (personal content). */
export const TAG_PROMPT_VERSION = "tag-file.v1";

export interface TagResult {
  subject_code: string | null;
  unit: string | null;
  topic: string | null;
  summary: string;
  key_terms: string[];
  tasks: { title: string; type: "test" | "homework" | "submission" | "event"; date: string; quote: string; confidence: number }[];
}

/** Strict JSON schema (every property required; nullable fields allow null). */
export const TAG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject_code", "unit", "topic", "summary", "key_terms", "tasks"],
  properties: {
    subject_code: { type: ["string", "null"], description: "One of the given subject codes, or null" },
    unit: { type: ["string", "null"], description: "Unit name, preferring one from the given list" },
    topic: { type: ["string", "null"], description: "Short topic, 2–6 words" },
    summary: { type: "string", description: "Exactly 2 short lines" },
    key_terms: { type: "array", items: { type: "string" }, description: "Up to 12 key terms found in the text" },
    tasks: {
      type: "array",
      description: "Dated deadlines, tests or events written in the file; empty if none",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "type", "date", "quote", "confidence"],
        properties: {
          title: { type: "string" },
          type: { type: "string", enum: ["test", "homework", "submission", "event"] },
          date: { type: "string", description: "YYYY-MM-DD" },
          quote: { type: "string", description: "Exact words from the file" },
          confidence: { type: "number", description: "0 to 1" },
        },
      },
    },
  },
} as const;

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
