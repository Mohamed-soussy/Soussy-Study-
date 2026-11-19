/**
 * Lesson recording analyzer prompts, version 1 (section 11).
 * Everything here runs on Groq: lessons are the student's private data.
 */
export const LESSON_PROMPT_VERSION = "lesson.v1.0";

export const ITEM_KINDS = ["homework", "test", "deadline", "announcement"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ANALYZE_SYSTEM = `You read part of a transcript of a recorded high school class and find what the student must not miss. Lines start with the time in the recording, like [34:12]. Lines marked (screen) are text read from the slides or whiteboard at that time.

Find:
1. items: things the student must do or know a date for.
   - homework: work to do ("do questions 1 to 3 on page 45 for Thursday").
   - test: a test, quiz or exam, and what is on it ("this will be on Friday's test").
   - deadline: a submission or form with a due date (IA draft, EE meeting, permission slip).
   - announcement: a trip, event, room or schedule change.
   For each item:
   - title: short and specific, in the language of the lesson, e.g. "Questions 1–3, page 45" or "Quiz on Lenz's law". Do not add the subject name.
   - details: what exactly to do or study, including pages, questions, format and anything to bring. One or two sentences.
   - due_text: the teacher's exact words for when, e.g. "for Thursday", "next lesson", "by the 14th", "after the break". Empty if no time was said.
   - due_date: your best YYYY-MM-DD for due_text, counting from the lesson date given below. Empty if no time was said.
   - at: the [mm:ss] time of the line where the teacher said it, copied exactly.
   - quote: the teacher's exact words from that line (up to 30 words), copied character for character.
   - confidence: 0.9+ when the teacher clearly set it; 0.5–0.8 when it was implied or unclear ("maybe we'll have a quiz"); below 0.5 do not include it.
   Only include what the TEACHER asked for or announced. Not jokes, not examples of homework from other years, not things a student suggested that the teacher didn't confirm. One item per task; don't split one task into several.
2. stressed: things the teacher stressed as important ("remember this", "students always get this wrong", "this comes up every year").
3. concepts: key ideas, definitions, formulas and worked examples taught in this part, each in one short sentence a student could revise from.
4. questions: questions students asked and the teacher's answer, each in one sentence.
5. chapters: where the topic changes, with a 2–5 word title, e.g. {"at":"6:40","title":"Lenz's law"}. The first chapter starts at the first line of this part.
6. summary: 2–4 sentences on what this part of the lesson covered.

Rules: use only what is in the transcript; never invent pages, dates or quotes. Copy every "at" from a line's time. Write in the language the teacher mostly speaks (English or Arabic). If nothing fits a list, return an empty list.`;

const TIMED = (extra: Record<string, unknown>, req: string[]) => ({
  type: "object",
  additionalProperties: false,
  required: [...req, "at"],
  properties: { ...extra, at: { type: "string" } },
});

export const ANALYZE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "stressed", "concepts", "questions", "chapters", "summary"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "details", "due_text", "due_date", "at", "quote", "confidence"],
        properties: {
          kind: { type: "string", enum: [...ITEM_KINDS] },
          title: { type: "string" },
          details: { type: "string" },
          due_text: { type: "string" },
          due_date: { type: "string" },
          at: { type: "string" },
          quote: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
    stressed: { type: "array", items: TIMED({ text: { type: "string" } }, ["text"]) },
    concepts: { type: "array", items: TIMED({ text: { type: "string" } }, ["text"]) },
    questions: { type: "array", items: TIMED({ q: { type: "string" }, a: { type: "string" } }, ["q", "a"]) },
    chapters: { type: "array", items: TIMED({ title: { type: "string" } }, ["title"]) },
    summary: { type: "string" },
  },
} as const;

export interface AnalyzeOut {
  items: { kind: ItemKind; title: string; details: string; due_text: string; due_date: string; at: string; quote: string; confidence: number }[];
  stressed: { text: string; at: string }[];
  concepts: { text: string; at: string }[];
  questions: { q: string; a: string; at: string }[];
  chapters: { title: string; at: string }[];
  summary: string;
}

export function analyzeUser(a: { subject: string; title: string; lessonDate: string; weekday: string; part: number; parts: number; text: string }) {
  return `Lesson: ${a.title}${a.subject ? ` (${a.subject})` : ""}. Lesson date: ${a.lessonDate} (${a.weekday}). This is part ${a.part} of ${a.parts}.

<transcript>
${a.text}
</transcript>`;
}

export const SUMMARY_SYSTEM = `You write study notes from a recorded class for a high school student (IB or American curriculum). You get the summaries of each part of the lesson, the key ideas, what the teacher stressed, and the tasks that were set. Write in the language of the lesson.

Write Markdown:
- One line: what the lesson was about.
- "## Key ideas": 4–8 bullets with the concepts, definitions and formulas (LaTeX math in $...$).
- "## The teacher stressed": the warnings and "remember this" points, if any.
- "## To do": every task with its due date, if any.
Keep it to one page. Use only what you were given. Never add facts that weren't in the lesson.`;

export const MISSED_SYSTEM = `A student was absent from this class. Using only the notes you are given, write a short catch-up brief in Markdown, in the language of the lesson:
- "## What you missed": 3–5 sentences, plain and friendly.
- "## Do this before next class": a checklist of every task and its due date, plus anything to read or bring.
- "## Learn these": the 3–6 ideas they need most, each with one line of explanation.
- "## Ask your teacher": 1–3 questions worth asking, based on what was unclear or stressed.
Never invent anything that wasn't in the notes.`;

export const QUIZ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["q", "options", "answer", "why", "at"],
        properties: {
          q: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer: { type: "integer" },
          why: { type: "string" },
          at: { type: "string" },
        },
      },
    },
  },
} as const;

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  why: string;
  at: string;
}

export const QUIZ_PROMPT = (notes: string, count: number) => `Write a ${count}-question multiple-choice quiz on this lesson for a high school student, in the language of the lesson.
Each question: 4 options, exactly one correct; "answer" is the index (0–3) of the correct option; "why" explains the answer in one sentence; "at" is the [mm:ss] time in the lesson where it was taught (copy it from the notes, without brackets). Test understanding, not trivia. Use only what is in the notes. Plain text with Unicode math (no LaTeX).

<notes>
${notes}
</notes>`;

export const LESSON_CHAT_SYSTEM = `You answer a student's questions about one recorded class, using only the transcript excerpts you are given. Each excerpt line starts with its time, like [34:12].
- Quote the teacher's words when it helps, and put the time in square brackets right after, like this: The teacher said "it's on Friday's test" [34:12]. Every claim needs a time.
- If the excerpts don't answer the question, say the lesson didn't cover it (or that you couldn't find it), and suggest where to look. Never invent what the teacher said.
- Reply in the language of the question. Keep it short. Use Markdown; math in LaTeX $...$.`;

/* ---------- pasted assignment text (section 10.1, Level 1) ---------- */

export const PASTE_SYSTEM = `A student pasted text from school: a Teams or email message, an assignment page, a class newsletter or a schedule. Find every task, test, deadline and event in it.
For each: kind (homework, test, deadline, announcement), title (short and specific, no subject name), details (what to do, one or two sentences), subject (the class or subject it belongs to as written, or empty), due_text (the exact words for when, or empty), due_date (YYYY-MM-DD counting from today's date given below, or empty), confidence (0–1).
Use only what is in the text. Ignore signatures, greetings and links that aren't tasks.`;

export const PASTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "details", "subject", "due_text", "due_date", "confidence"],
        properties: {
          kind: { type: "string", enum: [...ITEM_KINDS] },
          title: { type: "string" },
          details: { type: "string" },
          subject: { type: "string" },
          due_text: { type: "string" },
          due_date: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
  },
} as const;

export interface PasteOut {
  items: { kind: ItemKind; title: string; details: string; subject: string; due_text: string; due_date: string; confidence: number }[];
}

/* ---------- second look at likely tasks the first pass missed ---------- */

export const CHECK_SYSTEM = `You check short snippets from a recorded class. Each snippet is numbered and its lines start with the time, like [22:01]. For each snippet decide: did the TEACHER set the students a task, announce a test or quiz, give a deadline, or announce an event, in this snippet?
- If yes: is_item true, and fill kind (homework, test, deadline, announcement), title (short, no subject name), details, due_text (exact words for when, or empty), due_date (YYYY-MM-DD from the lesson date, or empty), at (the [mm:ss] of the line, without brackets), quote (the teacher's exact words), confidence (0–1).
- If no (an example, a story about other years, a student talking, a rhetorical question): is_item false and leave the other fields empty, confidence 0.
Return one result per snippet, in order.`;

export const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["n", "is_item", "kind", "title", "details", "due_text", "due_date", "at", "quote", "confidence"],
        properties: {
          n: { type: "integer" },
          is_item: { type: "boolean" },
          kind: { type: "string", enum: [...ITEM_KINDS, ""] },
          title: { type: "string" },
          details: { type: "string" },
          due_text: { type: "string" },
          due_date: { type: "string" },
          at: { type: "string" },
          quote: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
  },
} as const;

export interface CheckOut {
  results: { n: number; is_item: boolean; kind: ItemKind | ""; title: string; details: string; due_text: string; due_date: string; at: string; quote: string; confidence: number }[];
}

/**
 * Words that usually mean the teacher is setting work or a date (English and Arabic).
 * Lines like these get a second look if the first pass found nothing near them.
 */
export const TASK_CUE =
  /\b(homework|hw|for (next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tomorrow)|by (next|the|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)|next (lesson|class|time)|due|deadline|submit|hand (it )?in|read (section|chapter|pages?)|do (questions|exercises|problems|page)|finish|complete|worksheet|quiz|test|exam|bring|remember to)\b|واجب|للحصة القادمة|سلّموا|سلموا|اختبار|امتحان|اقرأوا|حلّوا|حلوا|موعد التسليم/i;
