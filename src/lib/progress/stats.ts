"use client";

import { load, save } from "@/lib/data/repo";
import { getRepo3 } from "@/lib/data/repo3";
import { getRepo6 } from "@/lib/data/repo6";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { listStudyDays, streakOf, type StudyDay } from "./study";
import { levelOf, listXp, type XpEvent } from "./xp";

/** Quiz, lesson-quiz, mock-exam and battle results: they feed the weak-topic chart. */
export interface QuizAttempt {
  id: string;
  kind: "quiz" | "mock" | "battle" | "lesson";
  subject_code: string | null;
  unit: string | null;
  score: number;
  total: number;
  data: Record<string, unknown>;
  created_at: string;
}

export async function saveAttempt(a: Omit<QuizAttempt, "id" | "created_at">) {
  const sb = getSupabaseBrowser();
  try {
    if (sb) await sb.from("quiz_attempts").insert(a);
    else save("quiz_attempts", [...load<QuizAttempt>("quiz_attempts"), { ...a, id: crypto.randomUUID(), created_at: new Date().toISOString() }]);
  } catch {
    /* never block the quiz */
  }
}

export async function listAttempts(): Promise<QuizAttempt[]> {
  const sb = getSupabaseBrowser();
  if (!sb) return load<QuizAttempt>("quiz_attempts");
  const { data } = await sb.from("quiz_attempts").select("*").order("created_at").limit(1000);
  return (data ?? []) as QuizAttempt[];
}

export interface UnitMastery {
  subject: string;
  unit: string;
  /** 0–100 */
  mastery: number;
  /** How many answers it's based on. */
  evidence: number;
}

/**
 * Weak-topic chart (section 12.1): mastery by unit from quizzes, mock exams, flashcards
 * and the mistake log. A unit needs at least 3 answers before it shows.
 */
export async function masteryByUnit(): Promise<UnitMastery[]> {
  const repo3 = getRepo3();
  const [attempts, decks, cards, mistakes] = await Promise.all([
    listAttempts(),
    repo3.decks.list().catch(() => []),
    repo3.cards.list().catch(() => []),
    repo3.mistakes.list().catch(() => []),
  ]);
  const acc = new Map<string, { subject: string; unit: string; right: number; total: number }>();
  const add = (subject: string | null, unit: string | null, right: number, total: number) => {
    if (!subject || !unit || total <= 0) return;
    const key = `${subject}::${unit.trim().toLowerCase()}`;
    const cur = acc.get(key) ?? { subject, unit: unit.trim(), right: 0, total: 0 };
    cur.right += right;
    cur.total += total;
    acc.set(key, cur);
  };
  for (const a of attempts) add(a.subject_code, a.unit, a.score, a.total);
  for (const d of decks) {
    const cs = cards.filter((c) => c.deck_id === d.id && c.reps > 0);
    const reps = cs.reduce((s, c) => s + c.reps, 0);
    const lapses = cs.reduce((s, c) => s + c.lapses, 0);
    add(d.subject_code, d.name, reps - lapses, reps);
  }
  // Solver mistakes: each is a wrong answer on that topic.
  for (const m of mistakes.filter((x) => x.source === "solver")) add(m.subject, m.topic, 0, 1);
  return [...acc.values()]
    .filter((x) => x.total >= 3)
    .map((x) => ({ subject: x.subject, unit: x.unit, mastery: Math.round((Math.max(0, x.right) / x.total) * 100), evidence: x.total }))
    .sort((a, b) => a.mastery - b.mastery);
}

export interface Badge {
  id: string;
  earned: boolean;
  /** 0–1 toward earning it. */
  progress: number;
}

export interface Progress {
  xp: number;
  level: ReturnType<typeof levelOf>;
  days: StudyDay[];
  streak: ReturnType<typeof streakOf>;
  totalMinutes: number;
  badges: Badge[];
  events: XpEvent[];
  helped: number;
  published: number;
}

export async function loadProgress(): Promise<Progress> {
  const [events, days, mine] = await Promise.all([listXp(), listStudyDays(), getRepo6().notes.mine().catch(() => [])]);
  const xp = events.reduce((s, e) => s + e.points, 0);
  const streak = streakOf(days);
  const totalMinutes = days.reduce((s, d) => s + d.minutes, 0);
  const published = mine.filter((n) => n.status === "approved").length;
  // "Helped N students": ratings other students gave your shared notes.
  const helped = mine.reduce((s, n) => s + n.rating_count, 0);
  const count = (k: XpEvent["kind"]) => events.filter((e) => e.kind === k).length;
  const quizzes = await listAttempts();
  const perfect = quizzes.some((q) => q.total >= 5 && q.score === q.total);
  const level = levelOf(xp);
  const b = (id: string, value: number, goal: number): Badge => ({ id, earned: value >= goal, progress: Math.min(1, value / goal) });
  const badges = [
    b("streak7", streak.best, 7),
    b("focus10h", totalMinutes, 600),
    b("cards100", count("cards"), 100),
    b("firstLesson", count("lesson"), 1),
    b("firstNote", published, 1),
    b("helped10", helped, 10),
    b("solver25", count("solver"), 25),
    b("tasks50", count("task"), 50),
    { id: "perfectQuiz", earned: perfect, progress: perfect ? 1 : 0 },
    b("level5", level.level, 5),
  ];
  return { xp, level, days, streak, totalMinutes, badges, events, helped, published };
}
