"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { check, table } from "@/lib/data/repo";
import { deleteBlob } from "@/lib/data/idb";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { mediaKey, slideKey, type Lesson, type NewLesson } from "./types";

/**
 * Phase 5 data: lessons and school connections. Same pattern as repo.ts:
 * Supabase when signed in, this browser in demo mode.
 */

export interface Connection {
  id: string;
  provider: "ics" | "microsoft";
  label: string;
  url: string | null;
  account: string | null;
  settings: ConnectionSettings;
  last_sync: string | null;
  last_error: string | null;
  created_at: string;
}

/** What to import, per type and per class (section 10.4). */
export interface ConnectionSettings {
  assignments?: boolean;
  calendar?: boolean;
  files?: boolean;
  /** Teams classes (or feed subjects) switched off. */
  mutedClasses?: string[];
}

export interface Repo5 {
  mode: "live" | "demo";
  lessons: {
    list(): Promise<Lesson[]>;
    get(id: string): Promise<Lesson | null>;
    create(l: NewLesson): Promise<Lesson>;
    update(id: string, patch: Partial<Lesson>): Promise<void>;
    remove(id: string): Promise<void>;
  };
  connections: {
    list(): Promise<Connection[]>;
    create(c: Partial<Connection> & Pick<Connection, "provider">): Promise<Connection>;
    update(id: string, patch: Partial<Connection>): Promise<void>;
    remove(id: string): Promise<void>;
  };
}

const LIST_COLUMNS = "id,title,subject_code,lesson_date,media_name,media_kind,duration_s,status,error,items,created_at";
const now = () => new Date().toISOString();

const EMPTY = { transcript: [], chapters: [], slides: [], items: [], key_points: [], summary: null, missed: null, error: null, duration_s: null };

async function forgetMedia(id: string) {
  await deleteBlob(mediaKey(id)).catch(() => {});
  for (let n = 0; n < 16; n++) await deleteBlob(slideKey(id, n)).catch(() => {});
}

function live(sb: SupabaseClient): Repo5 {
  return {
    mode: "live",
    lessons: {
      // The list skips transcripts (they can be large).
      list: async () => (check(await sb.from("lessons").select(LIST_COLUMNS).order("lesson_date", { ascending: false })) as Partial<Lesson>[]).map((l) => ({ ...EMPTY, ...l }) as Lesson),
      get: async (id) => check(await sb.from("lessons").select("*").eq("id", id).maybeSingle()) as Lesson | null,
      create: async (l) => check(await sb.from("lessons").insert({ ...l, status: "processing" }).select().single()) as Lesson,
      update: async (id, patch) => void check(await sb.from("lessons").update(patch).eq("id", id)),
      remove: async (id) => {
        check(await sb.from("lessons").delete().eq("id", id));
        await forgetMedia(id);
      },
    },
    connections: {
      list: async () => check(await sb.from("connections").select("*").order("created_at")) as Connection[],
      create: async (c) => check(await sb.from("connections").insert(c).select().single()) as Connection,
      update: async (id, patch) => void check(await sb.from("connections").update(patch).eq("id", id)),
      remove: async (id) => void check(await sb.from("connections").delete().eq("id", id)),
    },
  };
}

function demo(): Repo5 {
  const lessons = table<Lesson>("lessons");
  const connections = table<Connection>("connections");
  return {
    mode: "demo",
    lessons: {
      list: async () => lessons.all().sort((a, b) => b.lesson_date.localeCompare(a.lesson_date) || b.created_at.localeCompare(a.created_at)),
      get: async (id) => lessons.all().find((l) => l.id === id) ?? null,
      create: async (l) => lessons.insert({ ...EMPTY, ...l, id: crypto.randomUUID(), status: "processing", created_at: now() }),
      update: async (id, patch) => lessons.patch(id, patch),
      remove: async (id) => {
        lessons.remove((l) => l.id === id);
        await forgetMedia(id);
      },
    },
    connections: {
      list: async () => connections.all(),
      create: async (c) => connections.insert({ label: "", url: null, account: null, settings: {}, last_sync: null, last_error: null, ...c, id: crypto.randomUUID(), created_at: now() }),
      update: async (id, patch) => connections.patch(id, patch),
      remove: async (id) => connections.remove((c) => c.id === id),
    },
  };
}

let repo: Repo5 | null = null;
export function getRepo5(): Repo5 {
  if (!repo) {
    const sb = getSupabaseBrowser();
    repo = sb ? live(sb) : demo();
  }
  return repo;
}
