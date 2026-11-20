"use client";

import { load, save } from "@/lib/data/repo";
import { getSupabaseBrowser } from "@/lib/supabase/client";

/**
 * XP (section 12.4): points for things that help learning: tasks done, focus minutes,
 * flashcards, quizzes, lessons, solver practice and helping other students.
 */
export type XpKind = "task" | "focus" | "cards" | "quiz" | "lesson" | "solver" | "community" | "streak" | "badge" | "exam";

export interface XpEvent {
  id: string;
  kind: XpKind;
  points: number;
  ref: string | null;
  created_at: string;
}

export const XP_CHANGED = "soussy:xp-changed";

/** Adds points. The same ref only ever counts once (so re-ticking a task gives nothing). */
export async function awardXp(kind: XpKind, points: number, ref?: string): Promise<void> {
  const pts = Math.max(0, Math.min(200, Math.round(points)));
  if (!pts) return;
  const sb = getSupabaseBrowser();
  try {
    if (sb) {
      if (ref) {
        const { data } = await sb.from("xp_events").select("id").eq("kind", kind).eq("ref", ref).limit(1);
        if (data?.length) return;
      }
      await sb.from("xp_events").insert({ kind, points: pts, ref: ref ?? null });
    } else {
      const all = load<XpEvent>("xp_events");
      if (ref && all.some((e) => e.kind === kind && e.ref === ref)) return;
      save("xp_events", [...all, { id: crypto.randomUUID(), kind, points: pts, ref: ref ?? null, created_at: new Date().toISOString() }]);
    }
    window.dispatchEvent(new Event(XP_CHANGED));
  } catch {
    /* points are a bonus: never break the feature that earned them */
  }
}

export async function listXp(): Promise<XpEvent[]> {
  const sb = getSupabaseBrowser();
  if (!sb) return load<XpEvent>("xp_events");
  const { data } = await sb.from("xp_events").select("*").order("created_at", { ascending: false }).limit(2000);
  return (data ?? []) as XpEvent[];
}

/** Levels get a little further apart each time: level n needs 100·n·(n+1)/2 XP in total. */
export function levelOf(xp: number) {
  let level = 1;
  while ((100 * level * (level + 1)) / 2 <= xp) level++;
  const start = (100 * (level - 1) * level) / 2;
  const next = (100 * level * (level + 1)) / 2;
  return { level, into: xp - start, span: next - start };
}
