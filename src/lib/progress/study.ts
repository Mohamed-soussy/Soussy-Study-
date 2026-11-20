"use client";

import { load, save } from "@/lib/data/repo";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { awardXp } from "./xp";

/**
 * Verified study time and practice (section 12B). Time counts only from the timer (the
 * student was active), never between midnight and 5 am, and at most 10 hours a day.
 */
export interface StudyDay {
  day: string; // YYYY-MM-DD, local
  minutes: number;
  on_task_pct: number | null;
  questions: number;
  correct: number;
  units: number;
  subject_minutes: Record<string, number>;
}

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const MAX_DAY_MINUTES = 600;
export const STUDY_CHANGED = "soussy:study-changed";

/** Midnight to 5 am never counts (healthy limits, section 12B). */
export const isSleepTime = (d = new Date()) => d.getHours() < 5;

async function readDay(day: string): Promise<StudyDay> {
  const empty: StudyDay = { day, minutes: 0, on_task_pct: null, questions: 0, correct: 0, units: 0, subject_minutes: {} };
  const sb = getSupabaseBrowser();
  if (!sb) return load<StudyDay>("study_days").find((d) => d.day === day) ?? empty;
  const { data } = await sb.from("study_days").select("*").eq("day", day).maybeSingle();
  return (data as StudyDay | null) ?? empty;
}

async function writeDay(d: StudyDay) {
  const sb = getSupabaseBrowser();
  if (!sb) {
    save("study_days", [...load<StudyDay>("study_days").filter((x) => x.day !== d.day), d].slice(-400));
    return;
  }
  await sb.from("study_days").upsert(d, { onConflict: "user_id,day" });
}

/** Adds to today's totals. */
export async function recordStudy(add: { minutes?: number; subjectMinutes?: Record<string, number>; onTaskPct?: number; questions?: number; correct?: number; units?: number }) {
  if (isSleepTime() && add.minutes) add = { ...add, minutes: 0, subjectMinutes: {} };
  try {
    const d = await readDay(localDay());
    const minutes = Math.min(MAX_DAY_MINUTES, d.minutes + Math.max(0, Math.round(add.minutes ?? 0)));
    const subject_minutes = { ...d.subject_minutes };
    for (const [k, v] of Object.entries(add.subjectMinutes ?? {})) subject_minutes[k] = Math.round((subject_minutes[k] ?? 0) + v);
    // On-task share: weighted by minutes.
    const on_task_pct =
      add.onTaskPct !== undefined && add.minutes
        ? Math.round(((d.on_task_pct ?? add.onTaskPct) * d.minutes + add.onTaskPct * add.minutes) / Math.max(1, d.minutes + add.minutes))
        : d.on_task_pct;
    await writeDay({
      ...d,
      minutes,
      subject_minutes,
      on_task_pct,
      questions: d.questions + (add.questions ?? 0),
      correct: d.correct + (add.correct ?? 0),
      units: d.units + (add.units ?? 0),
    });
    window.dispatchEvent(new Event(STUDY_CHANGED));
  } catch {
    /* progress is a bonus: never break studying */
  }
}

export async function listStudyDays(): Promise<StudyDay[]> {
  const sb = getSupabaseBrowser();
  if (!sb) return load<StudyDay>("study_days").sort((a, b) => a.day.localeCompare(b.day));
  const { data } = await sb.from("study_days").select("*").order("day").limit(400);
  return (data ?? []) as StudyDay[];
}

/** A finished timer session: minutes per subject, focus score, units done, plus XP. */
export async function recordSession(s: { focusedMinutes: number; focusPct: number; units: { subject: string | null; minutes: number; done: boolean }[] }) {
  const subjectMinutes: Record<string, number> = {};
  for (const u of s.units) if (u.subject && u.minutes > 0) subjectMinutes[u.subject] = (subjectMinutes[u.subject] ?? 0) + u.minutes;
  const done = s.units.filter((u) => u.done).length;
  await recordStudy({ minutes: s.focusedMinutes, subjectMinutes, onTaskPct: s.focusPct, units: done });
  if (!isSleepTime()) await awardXp("focus", Math.min(120, Math.round(s.focusedMinutes / 5) * 2 + done * 5), `session:${Date.now()}`);
}

/**
 * Current streak in days. One missed day per week is covered by the weekly "streak freeze"
 * (section 12.4). Today doesn't break the streak until it's over.
 */
export function streakOf(days: StudyDay[], today = new Date()): { streak: number; freezeUsed: boolean; best: number } {
  const active = new Set(days.filter((d) => d.minutes >= 10 || d.questions >= 10 || d.units >= 1).map((d) => d.day));
  const dayAt = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return localDay(d);
  };
  const weekOf = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    d.setDate(d.getDate() - d.getDay());
    return localDay(d);
  };
  let streak = 0;
  const frozen = new Set<string>();
  for (let n = active.has(dayAt(0)) ? 0 : 1; n < 400; n++) {
    if (active.has(dayAt(n))) {
      streak++;
      continue;
    }
    const w = weekOf(n);
    if (!frozen.has(w) && active.has(dayAt(n + 1))) {
      frozen.add(w);
      continue;
    }
    break;
  }
  // Best ever (no freezes, simple run).
  const sorted = [...active].sort();
  let best = 0;
  let run = 0;
  let prev = "";
  for (const d of sorted) {
    const p = new Date(`${d}T12:00:00`);
    p.setDate(p.getDate() - 1);
    run = prev === localDay(p) ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { streak, freezeUsed: frozen.has(weekOf(0)), best: Math.max(best, streak) };
}
