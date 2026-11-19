/**
 * Whiteboard lesson prompt, version 1 (section 7). Runs on Gemini: the content is
 * a public syllabus topic, generated once and shared, never the student's own data.
 */
export const WHITEBOARD_PROMPT_VERSION = "whiteboard.v1";

export const WHITEBOARD_SYSTEM = `You are a brilliant high school teacher at a whiteboard. You explain one topic in a short, clear spoken lesson while drawing diagrams that appear exactly when you mention them.

The board
- Coordinates: x from 0 (left) to 1000 (right), y from 0 (top) to 625 (bottom). Keep 30 units of margin.
- Plan the layout before writing: title area at the top (y 30–80), main diagram in the middle, labels and equations beside it. Nothing may overlap. Text of size "medium" is about 22 units tall and about 11 units wide per character; "large" is about 34 tall; "small" about 16 tall.
- Shapes: text (x,y = top-left), line and arrow (x,y → x2,y2), rect (x,y,w,h), circle (x,y = center, r), curve (points = [x1,y1,x2,y2,...], at least 6 points, for graphs and waves), highlight (a translucent box x,y,w,h to emphasize something already drawn).
- Colors: ink (default), primary (key idea), danger (warnings, common mistakes), success (correct result), warning, violet, teal. Use color with purpose.
- Give every important shape a short "label" naming what it is (e.g. "resistor", "tangent line", "product").
- Plain text only on the board (no LaTeX). Use Unicode for math: ², ³, √, π, Δ, →, ×, ÷, ≤, ≥, ½.

The narration
- 5 to 9 segments. Each segment is one or two short spoken sentences (under 35 words) that sound natural read aloud by a text-to-speech voice.
- Each action has "word": the 0-based index of the word in that segment's "say" at which the drawing should appear, so a shape appears exactly when it is mentioned. Count words by splitting on spaces.
- Draw a lot: every segment gets 2 to 5 actions, 18 to 30 actions in the whole lesson. Prefer a real diagram (apparatus, graph with axes, labelled parts, worked steps) over words on the board.
- Build the picture step by step: first the setup, then each idea, then a worked example or the key result, and end with a one-sentence summary and a highlight on the main result.
- Match the level: HL or AP goes deeper than SL or Standard. Be accurate; if a topic is ambiguous, pick the most common high school meaning.
- Write "say" and all board text in the requested language. For Arabic, use clear Modern Standard Arabic.`;

export function whiteboardPrompt(args: { topic: string; subject?: string; level?: string; curriculum?: string; language: "en" | "ar" }) {
  return `Topic: ${args.topic}
Subject: ${args.subject || "not given"}
Curriculum and level: ${[args.curriculum, args.level].filter(Boolean).join(", ") || "high school"}
Language: ${args.language === "ar" ? "Arabic" : "English"}

Write the whiteboard lesson.`;
}

/** Gemini response schema (OpenAPI subset). */
export const WHITEBOARD_SCHEMA = {
  type: "OBJECT",
  required: ["title", "segments"],
  properties: {
    title: { type: "STRING" },
    segments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["say", "actions"],
        properties: {
          say: { type: "STRING" },
          actions: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              required: ["word", "kind", "x", "y"],
              properties: {
                word: { type: "INTEGER" },
                kind: { type: "STRING", enum: ["text", "line", "arrow", "rect", "circle", "curve", "highlight"] },
                x: { type: "NUMBER" },
                y: { type: "NUMBER" },
                x2: { type: "NUMBER" },
                y2: { type: "NUMBER" },
                w: { type: "NUMBER" },
                h: { type: "NUMBER" },
                r: { type: "NUMBER" },
                points: { type: "ARRAY", items: { type: "NUMBER" } },
                text: { type: "STRING" },
                label: { type: "STRING" },
                color: { type: "STRING", enum: ["ink", "primary", "danger", "success", "warning", "violet", "teal"] },
                size: { type: "STRING", enum: ["small", "medium", "large"] },
                dashed: { type: "BOOLEAN" },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** Answering "what's this?" about a shape the student circled (section 7.2). Runs on Groq. */
export const WHITEBOARD_ASK_SYSTEM = `You are the teacher at the whiteboard in Soussy Study. The student paused your lesson, circled part of the drawing and asked a question about it. Answer in 2–4 short spoken sentences about that exact part, in the student's language. Plain text only (it will be read aloud), Unicode math, no Markdown, no LaTeX. If the question is unrelated to studying, gently steer back.`;

const n = { type: ["number", "null"] } as const;

/** Same lesson format as a strict JSON schema for Groq (every field required; unused ones are null). */
export const WHITEBOARD_SCHEMA_STRICT = {
  type: "object",
  additionalProperties: false,
  required: ["title", "segments"],
  properties: {
    title: { type: "string" },
    segments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["say", "actions"],
        properties: {
          say: { type: "string" },
          actions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["word", "kind", "x", "y", "x2", "y2", "w", "h", "r", "points", "text", "label", "color", "size", "dashed"],
              properties: {
                word: { type: "integer" },
                kind: { type: "string", enum: ["text", "line", "arrow", "rect", "circle", "curve", "highlight"] },
                x: { type: "number" },
                y: { type: "number" },
                x2: n,
                y2: n,
                w: n,
                h: n,
                r: n,
                points: { type: ["array", "null"], items: { type: "number" } },
                text: { type: ["string", "null"] },
                label: { type: ["string", "null"] },
                color: { type: "string", enum: ["ink", "primary", "danger", "success", "warning", "violet", "teal"] },
                size: { type: "string", enum: ["small", "medium", "large"] },
                dashed: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** A student's own solved problem replayed as a whiteboard lesson (section 8, "Send to whiteboard"). */
export function solutionWhiteboardPrompt(problem: string, solution: unknown, language: "en" | "ar") {
  return `Replay this solved problem as a whiteboard lesson: write the problem at the top, then work through the steps on the board while explaining them, and finish by boxing the answer with a highlight. Keep the same method and the same answer. Language: ${language === "ar" ? "Arabic" : "English"}.

Problem:
${problem.slice(0, 2000)}

Solution (JSON):
${JSON.stringify(solution).slice(0, 6000)}`;
}
