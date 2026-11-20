"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { check, load, save, table } from "./repo";

/**
 * Phase 7 social data: Squads (12.4) and teacher classes (12.5), migration 0007.
 * Supabase when signed in; in demo mode this browser plays every member.
 */

export interface Squad {
  id: string;
  name: string;
  code: string;
  owner_id: string;
  created_at: string;
}
export interface SquadMember {
  squad_id: string;
  user_id: string;
  nickname: string;
  joined_at: string;
}
export interface SquadMessage {
  id: number | string;
  squad_id: string;
  user_id: string;
  nickname: string;
  body: string;
  hidden: boolean;
  created_at: string;
}
export interface SquadItem {
  id: string;
  squad_id: string;
  user_id: string;
  kind: "link" | "deadline" | "note" | "whiteboard" | "deck";
  title: string;
  url: string | null;
  due: string | null;
  data: Record<string, unknown>;
  created_at: string;
}
export interface SchoolClass {
  id: string;
  teacher_id: string;
  name: string;
  subject_code: string | null;
  code: string;
  created_at: string;
}
export interface ClassPost {
  id: string;
  class_id: string;
  teacher_id: string;
  title: string;
  body: string | null;
  url: string | null;
  due: string | null;
  created_at: string;
}

const now = () => new Date().toISOString();
const DEMO = "demo-user";
const code6 = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");

export interface Repo7 {
  mode: "live" | "demo";
  me(): Promise<string>;
  squads: {
    mine(): Promise<Squad[]>;
    create(name: string): Promise<Squad>;
    join(code: string, nickname: string): Promise<string>;
    members(id: string): Promise<SquadMember[]>;
    leave(id: string, userId?: string): Promise<void>;
    remove(id: string): Promise<void>;
    messages(id: string): Promise<SquadMessage[]>;
    post(id: string, nickname: string, body: string): Promise<void>;
    items(id: string): Promise<SquadItem[]>;
    addItem(i: Omit<SquadItem, "id" | "user_id" | "created_at">): Promise<void>;
    removeItem(id: string): Promise<void>;
  };
  classes: {
    teaching(): Promise<SchoolClass[]>;
    joined(): Promise<SchoolClass[]>;
    create(name: string, subject: string | null): Promise<SchoolClass>;
    join(code: string): Promise<void>;
    size(id: string): Promise<number | null>;
    posts(id: string): Promise<ClassPost[]>;
    post(p: Omit<ClassPost, "id" | "teacher_id" | "created_at">): Promise<void>;
    removePost(id: string): Promise<void>;
    weakTopics(id: string): Promise<{ topic: string; students: number; mistakes: number }[]>;
  };
}

function live(sb: SupabaseClient): Repo7 {
  const me = async () => (await sb.auth.getUser()).data.user?.id ?? "";
  return {
    mode: "live",
    me,
    squads: {
      mine: async () => check(await sb.from("squads").select("*").order("created_at")) as Squad[],
      create: async (name) => check(await sb.from("squads").insert({ name }).select().single()) as Squad,
      join: async (code, nickname) => {
        const { data, error } = await sb.rpc("join_squad", { join_code: code, nick: nickname });
        if (error) throw new Error(error.message);
        return data as string;
      },
      members: async (id) => check(await sb.from("squad_members").select("*").eq("squad_id", id).order("joined_at")) as SquadMember[],
      leave: async (id, userId) => void check(await sb.from("squad_members").delete().eq("squad_id", id).eq("user_id", userId ?? (await me()))),
      remove: async (id) => void check(await sb.from("squads").delete().eq("id", id)),
      messages: async (id) => (check(await sb.from("squad_messages").select("*").eq("squad_id", id).order("created_at", { ascending: false }).limit(100)) as SquadMessage[]).reverse(),
      post: async (id, nickname, body) => void check(await sb.from("squad_messages").insert({ squad_id: id, nickname, body })),
      items: async (id) => check(await sb.from("squad_items").select("*").eq("squad_id", id).order("created_at", { ascending: false })) as SquadItem[],
      addItem: async (i) => void check(await sb.from("squad_items").insert(i)),
      removeItem: async (id) => void check(await sb.from("squad_items").delete().eq("id", id)),
    },
    classes: {
      teaching: async () => check(await sb.from("classes").select("*").eq("teacher_id", await me()).order("created_at")) as SchoolClass[],
      joined: async () => {
        const uid = await me();
        return (check(await sb.from("classes").select("*").neq("teacher_id", uid)) as SchoolClass[]) ?? [];
      },
      create: async (name, subject) => check(await sb.from("classes").insert({ name, subject_code: subject }).select().single()) as SchoolClass,
      join: async (code) => {
        const { error } = await sb.rpc("join_class", { join_code: code });
        if (error) throw new Error(error.message);
      },
      size: async (id) => ((await sb.rpc("class_size", { c: id })).data as number | null) ?? null,
      posts: async (id) => check(await sb.from("class_posts").select("*").eq("class_id", id).order("created_at", { ascending: false })) as ClassPost[],
      post: async (p) => void check(await sb.from("class_posts").insert(p)),
      removePost: async (id) => void check(await sb.from("class_posts").delete().eq("id", id)),
      weakTopics: async (id) => ((await sb.rpc("class_weak_topics", { c: id })).data ?? []) as { topic: string; students: number; mistakes: number }[],
    },
  };
}

function demo(): Repo7 {
  const squads = table<Squad>("squads");
  const members = table<SquadMember & { id: string }>("squad_members");
  const msgs = table<SquadMessage & { id: string }>("squad_messages");
  const items = table<SquadItem>("squad_items");
  const classes = table<SchoolClass>("classes");
  const posts = table<ClassPost>("class_posts");
  return {
    mode: "demo",
    me: async () => DEMO,
    squads: {
      mine: async () => squads.all().filter((s) => members.all().some((m) => m.squad_id === s.id && m.user_id === DEMO)),
      create: async (name) => {
        const s = squads.insert({ id: crypto.randomUUID(), name, code: code6(), owner_id: DEMO, created_at: now() });
        members.insert({ id: crypto.randomUUID(), squad_id: s.id, user_id: DEMO, nickname: "You", joined_at: now() });
        return s;
      },
      join: async (code) => {
        const s = squads.all().find((x) => x.code === code.trim().toUpperCase());
        if (!s) throw new Error("No squad has that code.");
        return s.id;
      },
      members: async (id) => members.all().filter((m) => m.squad_id === id),
      leave: async (id, userId) => members.remove((m) => m.squad_id === id && m.user_id === (userId ?? DEMO)),
      remove: async (id) => {
        squads.remove((s) => s.id === id);
        members.remove((m) => m.squad_id === id);
      },
      messages: async (id) => msgs.all().filter((m) => m.squad_id === id).slice(-100),
      post: async (id, nickname, body) => void msgs.insert({ id: crypto.randomUUID(), squad_id: id, user_id: DEMO, nickname, body, hidden: false, created_at: now() }),
      items: async (id) => items.all().filter((i) => i.squad_id === id).reverse(),
      addItem: async (i) => void items.insert({ ...i, id: crypto.randomUUID(), user_id: DEMO, created_at: now() }),
      removeItem: async (id) => items.remove((i) => i.id === id),
    },
    classes: {
      teaching: async () => classes.all().filter((c) => c.teacher_id === DEMO),
      joined: async () => load<SchoolClass>("joined_classes"),
      create: async (name, subject) => classes.insert({ id: crypto.randomUUID(), teacher_id: DEMO, name, subject_code: subject, code: code6(), created_at: now() }),
      join: async (code) => {
        const c = classes.all().find((x) => x.code === code.trim().toUpperCase());
        if (!c) throw new Error("No class has that code.");
        save("joined_classes", [...load<SchoolClass>("joined_classes").filter((x) => x.id !== c.id), c]);
      },
      size: async () => load<SchoolClass>("joined_classes").length,
      posts: async (id) => posts.all().filter((p) => p.class_id === id).reverse(),
      post: async (p) => void posts.insert({ ...p, id: crypto.randomUUID(), teacher_id: DEMO, created_at: now() }),
      removePost: async (id) => posts.remove((p) => p.id === id),
      // Anonymous class data needs 5+ real students; demo mode has one.
      weakTopics: async () => [],
    },
  };
}

let repo: Repo7 | null = null;
export function getRepo7(): Repo7 {
  if (!repo) {
    const sb = getSupabaseBrowser();
    repo = sb ? live(sb) : demo();
  }
  return repo;
}

/* ---------- live squad channel: new messages, quiz battles ---------- */

export type SquadEvent =
  | { type: "message" }
  | { type: "battle"; id: string; topic: string; questions: { q: string; options: string[]; answer: number; why: string }[]; host: string }
  | { type: "score"; battle: string; nick: string; score: number; ms: number };

export async function squadChannel(id: string, on: (e: SquadEvent) => void): Promise<{ send(e: SquadEvent): void; close(): void }> {
  const sb = getSupabaseBrowser();
  if (!sb) {
    const bc = new BroadcastChannel(`soussy-squad-${id}`);
    bc.onmessage = (e) => on(e.data as SquadEvent);
    return { send: (e) => bc.postMessage(e), close: () => bc.close() };
  }
  await sb.realtime.setAuth();
  const ch: RealtimeChannel = sb.channel(`squad:${id}`, { config: { private: true, broadcast: { self: false } } });
  ch.on("broadcast", { event: "squad" }, ({ payload }) => on(payload as SquadEvent)).subscribe();
  return { send: (e) => void ch.send({ type: "broadcast", event: "squad", payload: e }), close: () => void sb.removeChannel(ch) };
}
