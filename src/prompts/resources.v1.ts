/**
 * Resource finder and community vault prompts, version 1 (sections 9.1 and 9.2).
 */
export const RESOURCES_PROMPT_VERSION = "resources.v1.0";

export const ENRICH_SYSTEM = `You help a high school student pick study resources. You get web search results (title, URL, a short excerpt) for one unit of their course. For each result, by its number:
- type: "notes", "questions", "video", "past_paper_style" (exam-style questions written by someone else), "explainer" (an article that teaches the topic) or "other".
- level: what it suits: "HL", "SL", "both", "AP", "general" or "unknown".
- summary: exactly 3 short lines (separated by \\n) saying what the page covers, from the excerpt only.
- why: one sentence on why it's useful for THIS student's unit, or why it isn't.
- relevant: false if it's off-topic, an ad, a shop page or a login wall.
Never invent content that isn't in the excerpt.`;

export const ENRICH_SCHEMA = {
  type: "OBJECT",
  properties: {
    results: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          n: { type: "INTEGER" },
          type: { type: "STRING", enum: ["notes", "questions", "video", "past_paper_style", "explainer", "other"] },
          level: { type: "STRING", enum: ["HL", "SL", "both", "AP", "general", "unknown"] },
          summary: { type: "STRING" },
          why: { type: "STRING" },
          relevant: { type: "BOOLEAN" },
        },
        required: ["n", "type", "level", "summary", "why", "relevant"],
      },
    },
  },
  required: ["results"],
};

export interface Enriched {
  results: { n: number; type: string; level: string; summary: string; why: string; relevant: boolean }[];
}

export const QUESTIONS_PROMPT = (a: { course: string; unit: string; title: string; summary: string; count: number }) =>
  `Write ${a.count} ORIGINAL exam-style practice questions for ${a.course}, unit "${a.unit}", inspired by this resource ("${a.title}": ${a.summary}).
Do not copy any question from the resource or from official past papers; write new ones in the same style, with command terms (state, explain, calculate, evaluate) and marks in brackets.
Then give a short mark scheme for each.
Format in Markdown: "## Questions" as a numbered list, then "## Mark scheme" as a numbered list. Math in LaTeX $...$.`;

export const CHECK_NOTE_SYSTEM = `You check a study note a high school student wants to share with other students in a community library. Decide:
- on_topic: is it about the subject and unit it's filed under?
- readable: is it clear enough to help another student (not gibberish, not a few random words)?
- copied_material: does it look copied from a textbook, a revision site, or an official IB/AP past paper or markscheme (long verbatim passages, copyright lines, "Paper 1 May 2019", question numbering from real papers)? Student-written summaries that cite a source are fine.
- personal_data: does it contain anyone's phone number, address, email, ID, or the full name of a real student or teacher?
- unsafe: bullying, sexual content, hate, self-harm instructions, cheating services (selling essays, leaking exams).
verdict: "approve" if on topic, readable and none of the problems; "reject" if unsafe or clearly copied; otherwise "hold" for a human moderator.
reason: one short, kind sentence the student will read (for approve, say what's good about it).`;

export const CHECK_NOTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "on_topic", "readable", "copied_material", "personal_data", "unsafe", "reason"],
  properties: {
    verdict: { type: "string", enum: ["approve", "hold", "reject"] },
    on_topic: { type: "boolean" },
    readable: { type: "boolean" },
    copied_material: { type: "boolean" },
    personal_data: { type: "boolean" },
    unsafe: { type: "boolean" },
    reason: { type: "string" },
  },
} as const;

export const MERGE_SYSTEM = `You merge the best student-written notes for one unit into one clean master summary. You get up to three notes, numbered [1], [2], [3].
- Keep every correct key idea, formula, definition and common mistake; drop repeats.
- After each sentence or bullet, cite which note it came from, like [1] or [2][3]. Every line needs a citation.
- If two notes disagree, keep the correct version and say so briefly.
- Structure: a one-line overview, "## Key ideas", "## Formulas" (if any, LaTeX $...$), "## Common mistakes". Keep it to one page.
- Use only what is in the notes.`;
