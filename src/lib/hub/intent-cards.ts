/**
 * Intent cards (section 6.3): starters so students never face a blank box.
 * Each card asks a few short questions, then writes a clear request for the tutor.
 * Prompts are written in English; the tutor answers in the student's language.
 */

export type FieldKey = "subject" | "topic" | "file" | "date" | "text" | "count" | "style" | "conceptA" | "conceptB" | "task" | "grade";
export type CardGroup = "exams" | "writing" | "assignments" | "understanding" | "memory" | "core" | "ap" | "listening";

export interface IntentCard {
  id: string;
  group: CardGroup;
  title: { en: string; ar: string };
  fields: FieldKey[];
  /** Only shown for this curriculum pack. */
  only?: "ib-dp" | "american-hs";
  prompt: (v: Record<FieldKey, string>) => string;
}

const about = (v: Record<FieldKey, string>) => [v.subject && `Subject: ${v.subject}.`, v.topic && `Topic: ${v.topic}.`].filter(Boolean).join(" ");

export const INTENT_CARDS: IntentCard[] = [
  // Exams
  { id: "prep-exam", group: "exams", title: { en: "Prep for an exam", ar: "استعد لاختبار" }, fields: ["subject", "topic", "date"],
    prompt: (v) => `Help me prepare for my exam. ${about(v)}${v.date ? ` The exam is on ${v.date}.` : ""} Start by checking what I already know with 2 quick questions, then give me a short plan.` },
  { id: "practice-test", group: "exams", title: { en: "Make a practice test", ar: "اصنع اختبارًا تجريبيًا" }, fields: ["subject", "topic", "count"],
    prompt: (v) => `Make a practice test of ${v.count || "8"} questions in the style of my real exams. ${about(v)} Show only the questions first; I'll answer, then you mark them with a mark scheme.` },
  { id: "quiz-weak", group: "exams", title: { en: "Quiz me on weak topics", ar: "اختبرني في نقاط ضعفي" }, fields: ["subject", "topic"],
    prompt: (v) => `Quiz me on the topics I find hard. ${about(v)} Ask one question at a time, wait for my answer, then give feedback before the next one.` },
  { id: "past-paper", group: "exams", title: { en: "Past-paper style questions", ar: "أسئلة بنمط الامتحانات السابقة" }, fields: ["subject", "topic"],
    prompt: (v) => `Write 4 original exam-style questions (not copied from real papers) with mark allocations and the official command words. ${about(v)}` },
  { id: "cram", group: "exams", title: { en: "Last-night cram sheet", ar: "ملخص الليلة الأخيرة" }, fields: ["subject", "topic"],
    prompt: (v) => `Make a one-page last-night cram sheet. ${about(v)} Key facts, formulas, definitions and the 3 most common mistakes.` },
  { id: "mistakes", group: "exams", title: { en: "Explain my mistakes", ar: "اشرح أخطائي" }, fields: ["subject", "text"],
    prompt: (v) => `${about(v)} Here is my answer and what I got wrong. Explain each mistake and how to avoid it next time:\n\n${v.text}` },

  // Writing
  { id: "plan-essay", group: "writing", title: { en: "Plan an essay", ar: "خطط لمقال" }, fields: ["subject", "topic"],
    prompt: (v) => `Help me plan my own essay (outline only, I'll write it). ${about(v)} Ask me for my position first, then build an outline with me.` },
  { id: "thesis", group: "writing", title: { en: "Check my thesis", ar: "راجع أطروحتي" }, fields: ["text"],
    prompt: (v) => `Check my thesis statement. Is it clear, arguable and specific? Suggest how I could sharpen it, without rewriting it for me:\n\n${v.text}` },
  { id: "rubric", group: "writing", title: { en: "Feedback against the rubric", ar: "ملاحظات حسب معايير التقييم" }, fields: ["subject", "text"],
    prompt: (v) => `${about(v)} Give feedback on my draft against the official assessment criteria. Label any marks as an estimate. Point to specific sentences and tell me what to improve; don't rewrite it:\n\n${v.text}` },
  { id: "paragraphs", group: "writing", title: { en: "Improve my paragraph structure", ar: "حسّن بناء فقراتي" }, fields: ["text"],
    prompt: (v) => `Look at the structure of my paragraph(s): topic sentence, evidence, analysis, link. Tell me what's missing and ask me questions to fix it myself:\n\n${v.text}` },
  { id: "counterclaims", group: "writing", title: { en: "Find counterclaims", ar: "اعثر على حجج مضادة" }, fields: ["topic"],
    prompt: (v) => `Give me 3 strong counterclaims to this argument and how I could respond to each: ${v.topic}` },
  { id: "citations", group: "writing", title: { en: "Citation help", ar: "مساعدة في التوثيق" }, fields: ["style", "text"],
    prompt: (v) => `Show me how to cite these sources in ${v.style || "MLA"} style, and explain the rule for each:\n\n${v.text}` },

  // Assignments
  { id: "break-down", group: "assignments", title: { en: "Break down an assignment", ar: "قسّم واجبًا" }, fields: ["task", "date"],
    prompt: (v) => `Break this assignment into small steps I can do one at a time${v.date ? `, due ${v.date}` : ""}:\n\n${v.task}` },
  { id: "what-asks", group: "assignments", title: { en: "What does this task actually ask?", ar: "ماذا تطلب هذه المهمة فعلًا؟" }, fields: ["task"],
    prompt: (v) => `Explain in simple words what this task is really asking me to do, including the command words and what a top answer needs:\n\n${v.task}` },
  { id: "step-plan", group: "assignments", title: { en: "Make a step plan to the deadline", ar: "خطة خطوات حتى الموعد" }, fields: ["task", "date"],
    prompt: (v) => `Make a day-by-day plan from today to the deadline (${v.date || "ask me for it"}) for this task, with short daily steps:\n\n${v.task}` },

  // Understanding
  { id: "explain-new", group: "understanding", title: { en: "Explain like I'm new", ar: "اشرح كأني مبتدئ" }, fields: ["subject", "topic"],
    prompt: (v) => `Explain this from zero, like I've never seen it. ${about(v)} Use a simple example, then check I understood with one question.` },
  { id: "analogy", group: "understanding", title: { en: "Explain with an analogy", ar: "اشرح بتشبيه" }, fields: ["topic"],
    prompt: (v) => `Explain ${v.topic} with an everyday analogy, then say where the analogy breaks down.` },
  { id: "compare", group: "understanding", title: { en: "Compare two concepts", ar: "قارن بين مفهومين" }, fields: ["conceptA", "conceptB"],
    prompt: (v) => `Compare ${v.conceptA} and ${v.conceptB} in a table: definition, key features, examples, and how exam questions tell them apart.` },
  { id: "summarize", group: "understanding", title: { en: "Summarize this file", ar: "لخّص هذا الملف" }, fields: ["file"],
    prompt: (v) => `Summarize the file "${v.file}" into the key points I need for my exam, citing pages.` },
  { id: "mind-map", group: "understanding", title: { en: "Make a mind map", ar: "اصنع خريطة ذهنية" }, fields: ["topic", "file"],
    prompt: (v) => `Make a mind map of ${v.topic || `the file "${v.file}"`} as a nested bullet list: main idea, branches, then details.` },
  { id: "cheat-sheet", group: "understanding", title: { en: "Turn my notes into a cheat sheet", ar: "حوّل ملاحظاتي إلى ورقة مراجعة" }, fields: ["file"],
    prompt: (v) => `Turn my notes in "${v.file}" into a compact cheat sheet, citing pages.` },

  // Memory
  { id: "flashcards", group: "memory", title: { en: "Make flashcards", ar: "اصنع بطاقات" }, fields: ["topic", "file"],
    prompt: (v) => `Make 12 flashcards on ${v.topic || `"${v.file}"`} as a table with columns Front and Back. Keep each side short.` },
  { id: "mnemonic", group: "memory", title: { en: "Make a mnemonic", ar: "اصنع طريقة للحفظ" }, fields: ["topic"],
    prompt: (v) => `Make 2 memorable mnemonics to remember: ${v.topic}` },
  { id: "key-terms", group: "memory", title: { en: "Key terms list", ar: "قائمة المصطلحات" }, fields: ["topic", "file"],
    prompt: (v) => `List the key terms for ${v.topic || `"${v.file}"`} with a one-line definition each, in a table.` },

  // IB Core
  { id: "tok-kq", group: "core", only: "ib-dp", title: { en: "TOK knowledge questions", ar: "أسئلة المعرفة في TOK" }, fields: ["topic"],
    prompt: (v) => `Help me find good TOK knowledge questions about: ${v.topic}. Explain what makes each one open, contestable and about knowledge.` },
  { id: "tok-objects", group: "core", only: "ib-dp", title: { en: "TOK exhibition objects", ar: "أغراض معرض TOK" }, fields: ["topic"],
    prompt: (v) => `I'm choosing objects for my TOK exhibition on the prompt: ${v.topic}. Ask me about my interests and help me judge object ideas. Don't write the commentary for me.` },
  { id: "ee-rq", group: "core", only: "ib-dp", title: { en: "EE research question refiner", ar: "تحسين سؤال المقال المطوّل" }, fields: ["subject", "text"],
    prompt: (v) => `${about(v)} Help me refine my Extended Essay research question. Is it focused, researchable in 4,000 words and arguable? Ask questions so I improve it myself:\n\n${v.text}` },
  { id: "cas-reflection", group: "core", only: "ib-dp", title: { en: "CAS reflection helper", ar: "مساعد تأملات CAS" }, fields: ["text"],
    prompt: (v) => `Ask me guiding questions to write my own CAS reflection about this experience, linked to the CAS learning outcomes:\n\n${v.text}` },

  // American / AP
  { id: "ap-frq", group: "ap", only: "american-hs", title: { en: "AP free-response practice", ar: "تدريب أسئلة AP المقالية" }, fields: ["subject", "topic"],
    prompt: (v) => `Give me one original AP-style free-response question. ${about(v)} After I answer, score it with a College Board style rubric (estimate).` },
  { id: "sat-act", group: "ap", only: "american-hs", title: { en: "SAT/ACT practice", ar: "تدريب SAT/ACT" }, fields: ["topic"],
    prompt: (v) => `Give me 5 original SAT/ACT-style practice questions on ${v.topic || "a mix of math and reading"}, one at a time.` },
  { id: "gpa", group: "ap", only: "american-hs", title: { en: "GPA what-if", ar: "ماذا لو في المعدل" }, fields: ["grade"],
    prompt: (v) => `Here are my current grades and course levels. Work out my weighted and unweighted GPA, then show what grades I'd need to reach my goal:\n\n${v.grade}` },

  // Listening
  { id: "audio-summary", group: "listening", title: { en: "5-minute audio summary", ar: "ملخص صوتي في 5 دقائق" }, fields: ["subject", "topic"],
    prompt: (v) => `Write a 5-minute two-voice podcast-style script (Host and Guest) that summarizes this unit for revision. ${about(v)} Keep it lively and accurate.` },
];

export const CARD_GROUPS: CardGroup[] = ["exams", "writing", "assignments", "understanding", "memory", "core", "ap", "listening"];
