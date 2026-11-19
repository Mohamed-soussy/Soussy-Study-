"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { check, load, save, table } from "./repo";

/**
 * Phase 3 data: solver history, mistake log, flashcards, settings and linked devices.
 * Same pattern as repo.ts: Supabase when signed in, this browser in demo mode.
 */

export interface SavedSolution {
  id: string;
  problem: string;
  subject: string | null;
  topic: string | null;
  solution: unknown;
  verification: unknown;
  created_at: string;
}

export interface Mistake {
  id: string;
  source: "solver" | "flashcards" | "quiz";
  subject: string | null;
  topic: string | null;
  question: string;
  given: string | null;
  correct: string | null;
  created_at: string;
}

export interface Deck {
  id: string;
  name: string;
  subject_code: string | null;
  source_file_id: string | null;
  created_at: string;
}

/** A flashcard plus its FSRS memory state (field names match ts-fsrs). */
export interface CardRow {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
  created_at: string;
}

export interface ReviewRow {
  id: string;
  card_id: string;
  rating: number;
  state: number;
  due: string;
  scheduled_days: number;
  reviewed_at: string;
}

export interface Device {
  id: string;
  name: string;
  linked: boolean;
  last_seen: string;
}

export interface LinkCode {
  code: string;
  device_id: string;
  expires_at: string;
  claimed_by: string | null;
  claimed_name: string | null;
}

/** Settings that follow the student: teachers, saved layouts, calculator model. */
export interface Prefs {
  teacher?: string;
  teacherBySubject?: Record<string, string>;
  customTeacher?: CustomTeacher;
  layouts?: { name: string; left: string; right: string; split: number }[];
  gdc?: "ti84" | "nspire" | "casio";
}

export interface CustomTeacher {
  name: string;
  strictness: number; // 1–5
  humor: number; // 1–5
  slang: boolean;
  emoji: boolean;
  arabicMix: boolean;
  voicePitch: number; // 0.5–1.5
}

export type NewCard = Pick<CardRow, "deck_id" | "front" | "back">;

export interface Repo3 {
  mode: "live" | "demo";
  solutions: { list(): Promise<SavedSolution[]>; create(s: Omit<SavedSolution, "id" | "created_at">): Promise<SavedSolution> };
  mistakes: { list(): Promise<Mistake[]>; create(m: Omit<Mistake, "id" | "created_at">): Promise<void> };
  decks: { list(): Promise<Deck[]>; create(d: Omit<Deck, "id" | "created_at">): Promise<Deck>; update(id: string, p: Partial<Deck>): Promise<void>; remove(id: string): Promise<void> };
  cards: {
    list(deckId?: string): Promise<CardRow[]>;
    createMany(cards: NewCard[]): Promise<CardRow[]>;
    update(id: string, p: Partial<CardRow>): Promise<void>;
    remove(id: string): Promise<void>;
  };
  reviews: { create(r: Omit<ReviewRow, "id">): Promise<void> };
  prefs: { get(): Promise<Prefs>; set(p: Prefs): Promise<void> };
  devices: {
    list(): Promise<Device[]>;
    upsert(d: Pick<Device, "id" | "name"> & Partial<Device>): Promise<void>;
    setLinked(id: string, linked: boolean): Promise<void>;
  };
  links: {
    create(code: string, deviceId: string): Promise<void>;
    get(code: string): Promise<LinkCode | null>;
    claim(code: string, byDevice: string, name: string): Promise<boolean>;
    remove(code: string): Promise<void>;
  };
}

const now = () => new Date().toISOString();

/** Fresh FSRS state for a new card (state 0 = new, due now). */
export function freshCard(c: NewCard): Omit<CardRow, "id" | "created_at"> {
  return { ...c, due: now(), stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0, last_review: null };
}

function live(sb: SupabaseClient): Repo3 {
  const uid = async () => {
    const { data } = await sb.auth.getUser();
    if (!data.user) throw new Error("not-signed-in");
    return data.user.id;
  };
  return {
    mode: "live",
    solutions: {
      list: async () => check(await sb.from("solutions").select("*").order("created_at", { ascending: false }).limit(30)) as SavedSolution[],
      create: async (s) => check(await sb.from("solutions").insert(s).select().single()) as SavedSolution,
    },
    mistakes: {
      list: async () => check(await sb.from("mistakes").select("*").order("created_at", { ascending: false }).limit(200)) as Mistake[],
      create: async (m) => void check(await sb.from("mistakes").insert(m)),
    },
    decks: {
      list: async () => check(await sb.from("flashcard_decks").select("*").order("created_at", { ascending: false })) as Deck[],
      create: async (d) => check(await sb.from("flashcard_decks").insert(d).select().single()) as Deck,
      update: async (id, p) => void check(await sb.from("flashcard_decks").update(p).eq("id", id)),
      remove: async (id) => void check(await sb.from("flashcard_decks").delete().eq("id", id)),
    },
    cards: {
      list: async (deckId) => {
        let q = sb.from("flashcards").select("*").order("created_at");
        if (deckId) q = q.eq("deck_id", deckId);
        return check(await q) as CardRow[];
      },
      createMany: async (cards) => (cards.length ? (check(await sb.from("flashcards").insert(cards.map(freshCard)).select()) as CardRow[]) : []),
      update: async (id, p) => void check(await sb.from("flashcards").update(p).eq("id", id)),
      remove: async (id) => void check(await sb.from("flashcards").delete().eq("id", id)),
    },
    reviews: { create: async (r) => void check(await sb.from("flashcard_reviews").insert(r)) },
    prefs: {
      get: async () => {
        const row = check(await sb.from("profiles").select("prefs").eq("id", await uid()).maybeSingle()) as { prefs: Prefs } | null;
        return row?.prefs ?? {};
      },
      set: async (p) => void check(await sb.from("profiles").update({ prefs: p }).eq("id", await uid())),
    },
    devices: {
      list: async () => check(await sb.from("devices").select("*").order("last_seen", { ascending: false })) as Device[],
      upsert: async (d) => void check(await sb.from("devices").upsert({ ...d, last_seen: now() })),
      setLinked: async (id, linked) => void check(await sb.from("devices").update({ linked }).eq("id", id)),
    },
    links: {
      create: async (code, deviceId) => void check(await sb.from("device_link_codes").upsert({ code, device_id: deviceId, expires_at: new Date(Date.now() + 5 * 60_000).toISOString(), claimed_by: null, claimed_name: null })),
      get: async (code) => check(await sb.from("device_link_codes").select("*").eq("code", code).maybeSingle()) as LinkCode | null,
      claim: async (code, by, name) => {
        const res = check(
          await sb.from("device_link_codes").update({ claimed_by: by, claimed_name: name }).eq("code", code).is("claimed_by", null).gt("expires_at", now()).select(),
        ) as LinkCode[];
        return res.length > 0;
      },
      remove: async (code) => void check(await sb.from("device_link_codes").delete().eq("code", code)),
    },
  };
}

function demo(): Repo3 {
  const solutions = table<SavedSolution>("solutions");
  const mistakes = table<Mistake>("mistakes");
  const decks = table<Deck>("decks");
  const cards = table<CardRow>("cards");
  const reviews = table<ReviewRow>("reviews");
  const devices = table<Device>("devices");
  return {
    mode: "demo",
    solutions: {
      list: async () => solutions.all().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30),
      create: async (s) => solutions.insert({ ...s, id: crypto.randomUUID(), created_at: now() }),
    },
    mistakes: {
      list: async () => mistakes.all().sort((a, b) => b.created_at.localeCompare(a.created_at)),
      create: async (m) => void mistakes.insert({ ...m, id: crypto.randomUUID(), created_at: now() }),
    },
    decks: {
      list: async () => decks.all().sort((a, b) => b.created_at.localeCompare(a.created_at)),
      create: async (d) => decks.insert({ ...d, id: crypto.randomUUID(), created_at: now() }),
      update: async (id, p) => decks.patch(id, p),
      remove: async (id) => {
        decks.remove((d) => d.id === id);
        cards.remove((c) => c.deck_id === id);
      },
    },
    cards: {
      list: async (deckId) => cards.all().filter((c) => !deckId || c.deck_id === deckId),
      createMany: async (list) => list.map((c) => cards.insert({ ...freshCard(c), id: crypto.randomUUID(), created_at: now() })),
      update: async (id, p) => cards.patch(id, p),
      remove: async (id) => cards.remove((c) => c.id === id),
    },
    reviews: { create: async (r) => void reviews.insert({ ...r, id: crypto.randomUUID() }) },
    prefs: {
      get: async () => (load<Prefs>("prefs")[0] as Prefs | undefined) ?? {},
      set: async (p) => save("prefs", [p]),
    },
    devices: {
      list: async () => devices.all(),
      upsert: async (d) => {
        if (devices.all().some((x) => x.id === d.id)) devices.patch(d.id, { ...d, last_seen: now() });
        else devices.insert({ linked: false, ...d, last_seen: now() });
      },
      setLinked: async (id, linked) => devices.patch(id, { linked }),
    },
    // Linking needs real accounts; demo mode keeps codes in this browser only.
    links: {
      create: async (code, deviceId) => save("links", [...load<LinkCode>("links"), { code, device_id: deviceId, expires_at: new Date(Date.now() + 300_000).toISOString(), claimed_by: null, claimed_name: null }]),
      get: async (code) => load<LinkCode>("links").find((l) => l.code === code) ?? null,
      claim: async (code, by, name) => {
        const all = load<LinkCode>("links");
        const l = all.find((x) => x.code === code && !x.claimed_by && x.expires_at > now());
        if (!l) return false;
        l.claimed_by = by;
        l.claimed_name = name;
        save("links", all);
        return true;
      },
      remove: async (code) => save("links", load<LinkCode>("links").filter((l) => l.code !== code)),
    },
  };
}

let repo: Repo3 | null = null;
export function getRepo3(): Repo3 {
  if (!repo) {
    const sb = getSupabaseBrowser();
    repo = sb ? live(sb) : demo();
  }
  return repo;
}
