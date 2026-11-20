/**
 * Practice and Core prompts, version 1 (sections 12.1, 12.2, 6A): mock exams, marking,
 * rubric feedback, teach-back, and the IB Core / college-prep helpers.
 * All of them work on the student's own work, so they run on Groq.
 * Academic honesty (section 14): plan, explain, quiz and give feedback; never write graded work.
 */
export const COACH_PROMPT_VERSION = "coach.v1.0";

const HONESTY = `Academic honesty: you never write work the student will hand in (IA, EE, TOK essay or exhibition, graded homework, college essays). You plan, question, explain and give feedback only. Any grade or band you give is an ESTIMATE and must be called one.`;

/* ---------- mock exam ---------- */

export const EXAM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "instructions", "questions"],
  properties: {
    title: { type: "string" },
    instructions: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["n", "type", "unit", "prompt", "options", "answer", "marks", "markscheme"],
        properties: {
          n: { type: "integer" },
          type: { type: "string", enum: ["mcq", "short", "long"] },
          unit: { type: "string" },
          prompt: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer: { type: "integer" },
          marks: { type: "integer" },
          markscheme: { type: "string" },
        },
      },
    },
  },
} as const;

export interface ExamQuestion {
  n: number;
  type: "mcq" | "short" | "long";
  unit: string;
  prompt: string;
  options: string[];
  answer: number;
  marks: number;
  markscheme: string;
}
export interface Exam {
  title: string;
  instructions: string;
  questions: ExamQuestion[];
}

export function examPrompt(a: { course: string; curriculum: string; units: string[]; style: string; minutes: number; calculator: boolean }) {
  const mcq = /paper 1|mcq|multiple/i.test(a.style);
  return `Write an ORIGINAL timed mock exam for ${a.course} (${a.curriculum}) in the style of ${a.style}, for ${a.minutes} minutes, ${a.calculator ? "calculator allowed" : "NO calculator"}.
Units: ${a.units.join("; ")}.
- ${mcq ? `About ${Math.min(30, Math.round(a.minutes * 0.9))} multiple-choice questions (type "mcq", 4 options, "answer" = index 0–3 of the correct option, 1 mark each).` : `Structured questions (type "short" for 1–4 marks, "long" for 5–9 marks) totalling about ${a.minutes} marks, with command terms (state, describe, explain, calculate, evaluate). For these, options is [] and answer is -1.`}
- Every question names its unit (copied from the list), in "unit".
- "markscheme": for mcq, one line on why the answer is right; otherwise the mark points in the official markscheme style ("M1 …", "A1 …", "1 mark for …"), one per line.
- Never copy real past-paper questions; write new ones of the same difficulty.
- Plain text with Unicode math (×, ², √, Δ); no LaTeX.
${HONESTY}`;
}

export const MARK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["n", "awarded", "feedback"],
        properties: { n: { type: "integer" }, awarded: { type: "number" }, feedback: { type: "string" } },
      },
    },
  },
} as const;

export const MARK_SYSTEM = `You are an experienced examiner marking a student's written answers against a markscheme. For each answer: award marks only for points that match the markscheme (or are clearly equivalent), never more than the question's marks; allow error carried forward where the markscheme style does; give one or two sentences of feedback saying what earned marks and exactly what was missing. Be fair and kind. These marks are an ESTIMATE.`;

/* ---------- rubric feedback (section 12.1) ---------- */

export const RUBRICS: Record<string, { label: string; criteria: { name: string; max: number }[] }> = {
  ib_sci_ia: { label: "IB Sciences IA", criteria: [{ name: "Research design", max: 6 }, { name: "Data analysis", max: 6 }, { name: "Conclusion", max: 6 }, { name: "Evaluation", max: 6 }] },
  ib_math_ia: { label: "IB Maths exploration (IA)", criteria: [{ name: "A Presentation", max: 4 }, { name: "B Mathematical communication", max: 4 }, { name: "C Personal engagement", max: 3 }, { name: "D Reflection", max: 3 }, { name: "E Use of mathematics", max: 6 }] },
  ib_ee: { label: "IB Extended Essay", criteria: [{ name: "A Framework for the essay", max: 6 }, { name: "B Knowledge and understanding", max: 6 }, { name: "C Analysis and line of argument", max: 6 }, { name: "D Discussion and evaluation", max: 8 }, { name: "E Engagement", max: 4 }] },
  ib_tok_essay: { label: "IB TOK essay", criteria: [{ name: "Holistic: quality of the response to the prescribed title", max: 10 }] },
  ib_eng_essay: { label: "IB English A essay / Paper 1", criteria: [{ name: "A Understanding and interpretation", max: 5 }, { name: "B Analysis and evaluation", max: 5 }, { name: "C Coherence, focus and organization", max: 5 }, { name: "D Language", max: 5 }] },
  ap_essay: { label: "AP English essay", criteria: [{ name: "Row A Thesis", max: 1 }, { name: "Row B Evidence and commentary", max: 4 }, { name: "Row C Sophistication", max: 1 }] },
  ap_frq: { label: "AP free-response answer", criteria: [{ name: "Points from the scoring guidelines", max: 9 }] },
};

export const FEEDBACK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["criteria", "band", "fixes", "strengths"],
  properties: {
    criteria: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "estimate", "max", "comment"],
        properties: { name: { type: "string" }, estimate: { type: "number" }, max: { type: "number" }, comment: { type: "string" } },
      },
    },
    band: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    fixes: { type: "array", items: { type: "string" } },
  },
} as const;

export interface Feedback {
  criteria: { name: string; estimate: number; max: number; comment: string }[];
  band: string;
  strengths: string[];
  fixes: string[];
}

export const FEEDBACK_SYSTEM = `You give a high school student criterion-by-criterion feedback on their own draft, the way a supportive IB/AP teacher would. For each criterion: an estimated mark (never above the maximum) and a short comment quoting or pointing to the exact part of the draft. Then: "band", the overall estimated band or grade, written as "Estimate: …"; two strengths; and exactly three concrete, doable fixes (what to change and where). Never rewrite their text or write new paragraphs for them; you may show at most one short example sentence on a DIFFERENT topic.
${HONESTY}`;

/* ---------- teach-back (Feynman) ---------- */

export const TEACH_SYSTEM = (topic: string, level: string) => `You are "Sam", a curious classmate who missed the lesson on "${topic}" (${level}). The student will teach it to you. Your job is to make them explain clearly and find gaps in their understanding.
- Ask ONE short follow-up question at a time: "why", "what would happen if", "can you give an example", "how is that different from …".
- If they say something wrong, don't correct them directly: act confused and ask a question that leads them to notice.
- Never lecture or explain the topic yourself.
- When the student types "done" (or after about 8 exchanges), stop being Sam and give a short report: "## How clearly you explained it" (an estimate out of 10), "## What you explained well", "## Gaps to review" (the specific ideas they missed or got wrong, with the correct idea in one line each).
- Match their language (English or Arabic). Keep each turn under 60 words until the report.`;

/* ---------- IB Core and college prep helpers (section 12.2) ---------- */

export const CORE_TASKS = {
  kq: (input: string) =>
    `Generate 6 TOK knowledge questions from this starting point: "${input}". Knowledge questions are open, contestable questions ABOUT knowledge (how we know, what counts as evidence, who decides), using TOK concepts (evidence, certainty, truth, interpretation, power, justification, explanation, objectivity, perspective, culture, values, responsibility). Mix the core theme, optional themes and areas of knowledge, and label each. Then one line on how to make a knowledge question sharper. Markdown list. ${HONESTY}`,
  exhibition: (input: string) =>
    `A student is planning their TOK exhibition. Their chosen IA prompt and three objects are below. For each object: does it have a specific real-world context (not a generic image)? Is the link to the prompt clear and justified? Suggest one question per object to strengthen the justification. Do NOT write the commentary. Estimate nothing.\n\n${input}\n\n${HONESTY}`,
  essay: (input: string) =>
    `A student chose this TOK prescribed title: "${input}". Help them PLAN, without writing the essay: 1) the key terms to define and why they matter; 2) two areas of knowledge that fit well, and why; 3) for each, a guiding question for a claim, a counterclaim and the kind of real-life example to look for; 4) three ways the essay could go wrong. Markdown. ${HONESTY}`,
  rq: (input: string) =>
    `Here is a student's draft Extended Essay research question (and subject): "${input}". Evaluate it against what makes a strong EE question: focused, researchable in 4,000 words, arguable (allows analysis, not just description), within the subject, uses precise terms. Then suggest three refined versions that keep THEIR topic and say what changed in each. Markdown. ${HONESTY}`,
  reflection: (input: string) =>
    `Give a student 6 reflection prompts for this CAS experience: "${input}". Cover what happened, feelings, what they learned about themselves, the CAS learning outcomes it connects to (identify strengths and growth, challenge, initiative and planning, collaboration, commitment and perseverance, global significance, ethics), and what they'd do next. Questions only; don't write the reflection. Markdown list.`,
  testplan: (input: string) =>
    `Make a realistic weekly SAT/ACT study plan from this: ${input}. Use official free practice (College Board Bluebook / Khan Academy for SAT; ACT.org for ACT). Plan by week until the test date: what to practice, one full timed practice test every 2–3 weeks, review of mistakes, and lighter final week. Include total hours per week. Markdown table plus 3 tips.`,
} as const;

export type CoreTask = keyof typeof CORE_TASKS;
