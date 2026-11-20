"use client";

import { useCallback, useEffect, useState } from "react";
import { load, save } from "@/lib/data/repo";
import { getSupabaseBrowser } from "@/lib/supabase/client";

/** IB Core and college-prep records (migration 0007, core_items). */
export type CoreKind =
  | "tok_kq" | "tok_exhibition" | "tok_essay" | "ee" | "ee_meeting" | "ee_source"
  | "cas_experience" | "cas_project" | "gpa_course" | "ap_exam" | "test_plan" | "college";

export interface CoreItem<T = Record<string, unknown>> {
  id: string;
  kind: CoreKind;
  data: T;
  created_at: string;
  updated_at: string;
}

const now = () => new Date().toISOString();

async function list<T>(kind: CoreKind): Promise<CoreItem<T>[]> {
  const sb = getSupabaseBrowser();
  if (!sb) return load<CoreItem<T>>("core_items").filter((i) => i.kind === kind);
  const { data } = await sb.from("core_items").select("*").eq("kind", kind).order("created_at");
  return (data ?? []) as CoreItem<T>[];
}

export async function addCore<T>(kind: CoreKind, data: T): Promise<CoreItem<T>> {
  const sb = getSupabaseBrowser();
  if (!sb) {
    const row: CoreItem<T> = { id: crypto.randomUUID(), kind, data, created_at: now(), updated_at: now() };
    save("core_items", [...load<CoreItem>("core_items"), row as CoreItem]);
    return row;
  }
  const { data: row, error } = await sb.from("core_items").insert({ kind, data }).select().single();
  if (error) throw error;
  return row as CoreItem<T>;
}

export async function updateCore<T>(id: string, data: T) {
  const sb = getSupabaseBrowser();
  if (!sb) return save("core_items", load<CoreItem>("core_items").map((i) => (i.id === id ? { ...i, data: data as Record<string, unknown>, updated_at: now() } : i)));
  await sb.from("core_items").update({ data, updated_at: now() }).eq("id", id);
}

export async function removeCore(id: string) {
  const sb = getSupabaseBrowser();
  if (!sb) return save("core_items", load<CoreItem>("core_items").filter((i) => i.id !== id));
  await sb.from("core_items").delete().eq("id", id);
}

/** Items of one kind, with add/update/remove that refresh the list. */
export function useCore<T>(kind: CoreKind) {
  const [items, setItems] = useState<CoreItem<T>[]>([]);
  const reload = useCallback(() => list<T>(kind).then(setItems).catch(() => {}), [kind]);
  useEffect(() => {
    reload();
  }, [reload]);
  return {
    items,
    add: async (d: T) => {
      const row = await addCore(kind, d);
      setItems((l) => [...l, row]);
      return row;
    },
    update: async (id: string, d: T) => {
      setItems((l) => l.map((i) => (i.id === id ? { ...i, data: d } : i)));
      await updateCore(id, d);
    },
    remove: async (id: string) => {
      setItems((l) => l.filter((i) => i.id !== id));
      await removeCore(id);
    },
  };
}

/** Calls an IB Core / college-prep AI helper (POST /api/coach/core). */
export async function coreAi(task: "kq" | "exhibition" | "essay" | "rq" | "reflection" | "testplan", input: string): Promise<string> {
  const res = await fetch("/api/coach/core", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, input }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message ?? "The AI couldn't answer right now.");
  return json.text as string;
}

/* ---------- formatting helpers ---------- */

export interface Source {
  author: string;
  title: string;
  container: string; // website, journal or publisher
  year: string;
  url: string;
  accessed: string; // YYYY-MM-DD
}

/** MLA 9 and APA 7 references, the two styles most IB schools use. */
export function cite(s: Source, style: "mla" | "apa"): string {
  const authors = s.author.trim();
  const acc = s.accessed ? new Date(`${s.accessed}T12:00:00`) : null;
  if (style === "apa") {
    const year = s.year ? `(${s.year})` : "(n.d.)";
    return [authors ? `${authors} ${year}.` : `${s.title}. ${year}.`, authors ? `${s.title}.` : "", s.container ? `${s.container}.` : "", s.url].filter(Boolean).join(" ");
  }
  // MLA: the access date only matters for web sources.
  const accessed = acc && s.url ? `Accessed ${acc.getDate()} ${acc.toLocaleDateString("en-GB", { month: "short" })}. ${acc.getFullYear()}.` : "";
  const tail = [s.container, s.year, s.url.replace(/^https?:\/\//, "")].filter(Boolean).join(", ");
  return [authors ? `${authors}.` : "", `"${s.title}."`, tail ? `${tail}.` : "", accessed].filter(Boolean).join(" ");
}

export const GRADE_POINTS: Record<string, number> = { "A+": 4, A: 4, "A-": 3.7, "B+": 3.3, B: 3, "B-": 2.7, "C+": 2.3, C: 2, "C-": 1.7, "D+": 1.3, D: 1, "D-": 0.7, F: 0 };

/** Unweighted GPA, and weighted with +0.5 for Honors and +1 for AP/IB (the common US scale). */
export function gpa(courses: { grade: string; credits: number; level: "regular" | "honors" | "ap" }[]) {
  const counted = courses.filter((c) => c.grade in GRADE_POINTS && c.credits > 0);
  const cr = counted.reduce((s, c) => s + c.credits, 0);
  if (!cr) return { unweighted: 0, weighted: 0, credits: 0 };
  const uw = counted.reduce((s, c) => s + GRADE_POINTS[c.grade] * c.credits, 0) / cr;
  const w = counted.reduce((s, c) => s + (GRADE_POINTS[c.grade] + (c.level === "ap" ? 1 : c.level === "honors" ? 0.5 : 0) * (GRADE_POINTS[c.grade] > 0 ? 1 : 0)) * c.credits, 0) / cr;
  return { unweighted: Math.round(uw * 100) / 100, weighted: Math.round(w * 100) / 100, credits: cr };
}

export const CAS_OUTCOMES = ["lo1", "lo2", "lo3", "lo4", "lo5", "lo6", "lo7"] as const;
