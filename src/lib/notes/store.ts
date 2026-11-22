"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";

/** One tab of a notebook (like a Google Docs tab), e.g. "8.1 Integration". */
export interface NoteTab {
  id: string;
  title: string;
  /** Markdown with math: $x^2$ inline, $$\int x\,dx$$ on its own line. */
  content: string;
}

export interface Notebook {
  id: string;
  title: string;
  subject_code: string | null;
  tabs: NoteTab[];
  updated_at: string;
}

const LOCAL = "soussy.notebooks";
const OLD_TEXT = "soussy.notes.text";
const uid = () => crypto.randomUUID();

export const newTab = (title = "Tab 1"): NoteTab => ({ id: uid(), title, content: "" });
export const newNotebook = (title = "Untitled notebook"): Notebook => ({ id: uid(), title, subject_code: null, tabs: [newTab()], updated_at: new Date().toISOString() });

function readLocal(): Notebook[] {
  try {
    const list = JSON.parse(localStorage.getItem(LOCAL) ?? "[]") as Notebook[];
    // Bring over the old single notes page, once.
    const old = localStorage.getItem(OLD_TEXT);
    if (old && old.trim() && !list.length) {
      const nb = newNotebook("My notes");
      nb.tabs[0].content = old;
      list.push(nb);
      localStorage.setItem(LOCAL, JSON.stringify(list));
    }
    return list;
  } catch {
    return [];
  }
}
function writeLocal(list: Notebook[]) {
  try {
    localStorage.setItem(LOCAL, JSON.stringify(list));
  } catch {
    /* storage full or blocked */
  }
}

/** Accounts: the notebooks table (migration 0009). Falls back to this device if it isn't there yet. */
async function remoteOk() {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const { error } = await sb.from("notebooks").select("id").limit(1);
  return error ? null : sb;
}

export async function listNotebooks(): Promise<Notebook[]> {
  const sb = await remoteOk();
  if (!sb) return readLocal().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const { data } = await sb.from("notebooks").select("id,title,subject_code,tabs,updated_at").order("updated_at", { ascending: false });
  const list = (data ?? []) as Notebook[];
  // First time on an account: upload notebooks kept on this device.
  const local = readLocal();
  if (!list.length && local.length) {
    for (const nb of local) await saveNotebook(nb);
    return local;
  }
  return list;
}

export async function saveNotebook(nb: Notebook): Promise<void> {
  const next = { ...nb, updated_at: new Date().toISOString() };
  const sb = await remoteOk();
  if (!sb) {
    const list = readLocal().filter((x) => x.id !== nb.id);
    writeLocal([next, ...list]);
    return;
  }
  await sb.from("notebooks").upsert({ id: next.id, title: next.title, subject_code: next.subject_code, tabs: next.tabs, updated_at: next.updated_at });
}

export async function deleteNotebook(id: string): Promise<void> {
  const sb = await remoteOk();
  if (!sb) return writeLocal(readLocal().filter((x) => x.id !== id));
  await sb.from("notebooks").delete().eq("id", id);
}

/** A tab's text with line numbers, so the AI can talk about "line 4". */
export function numbered(content: string): string {
  return content
    .split("\n")
    .map((l, i) => `L${i + 1}: ${l}`)
    .join("\n");
}

/**
 * Notes the student is asking about: a notebook or tab named in the question
 * ("my Math AA notes", "lesson 8.1"), or any notes when they say "my notes".
 */
export function matchNotes(q: string, books: Notebook[], max = 2): { book: Notebook; tab: NoteTab; score: number }[] {
  const text = q.toLowerCase();
  const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}.]+/u).filter((w) => w.length > 1);
  const qw = new Set(words(text));
  const saysNotes = /\b(my )?(notes?|notebook|notepad)\b|ملاحظات|دفتر/.test(text);
  const out: { book: Notebook; tab: NoteTab; score: number }[] = [];
  for (const book of books) {
    const bw = words(book.title);
    const bookHit = bw.length ? bw.filter((w) => qw.has(w)).length / bw.length : 0;
    for (const tab of book.tabs) {
      const tw = words(tab.title);
      const tabHit = tw.some((w) => /\d/.test(w) && text.includes(w)) ? 1 : tw.length ? tw.filter((w) => qw.has(w)).length / tw.length : 0;
      const score = bookHit * 2 + tabHit * 3 + (saysNotes ? 0.5 : 0);
      if (score >= 1.5 && tab.content.trim()) out.push({ book, tab, score });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}

/** Which tools a notebook gets: maths/science subjects get a calculator and Desmos; essay subjects get the AI-writing check. */
export type NotebookKind = "calc" | "writing" | "general";
export function notebookKind(subjectName: string | undefined | null): NotebookKind {
  const n = (subjectName ?? "").toLowerCase();
  if (/math|physic|chem|biolog|scien|econ|business|comput|statist|engineer|account|design|further|calculus|algebra|geometr|رياض|فيزياء|كيمياء|أحياء|اقتصاد/.test(n)) return "calc";
  if (/english|literat|language|arab|french|spanish|german|chinese|latin|history|philosoph|knowledge|tok|extended essay|psycholog|politic|geograph|anthropolog|essay|writing|عرب|إنجليز|أدب|تاريخ|فلسف/.test(n)) return "writing";
  return "general";
}
