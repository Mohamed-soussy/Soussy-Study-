"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { deleteBlob, getBlob, putBlob } from "./idb";
import type {
  CalendarEvent,
  Chat,
  ChatMessage,
  ChunkHit,
  FileNote,
  Folder,
  NewEvent,
  VaultFile,
} from "./types";

/**
 * One data API for every screen.
 * - Signed in with Supabase: rows live in Postgres, protected by row-level security.
 * - Demo mode: rows live in this browser (localStorage + IndexedDB for file bytes).
 */
export interface Repo {
  mode: "live" | "demo";
  events: {
    list(): Promise<CalendarEvent[]>;
    create(e: NewEvent): Promise<CalendarEvent>;
    createMany(list: NewEvent[]): Promise<CalendarEvent[]>;
    update(id: string, patch: Partial<CalendarEvent>): Promise<void>;
    remove(id: string): Promise<void>;
  };
  folders: {
    list(): Promise<Folder[]>;
    create(f: Omit<Folder, "id">): Promise<Folder>;
    update(id: string, patch: Partial<Folder>): Promise<void>;
    remove(id: string): Promise<void>;
  };
  files: {
    list(): Promise<VaultFile[]>;
    get(id: string): Promise<VaultFile | null>;
    upload(file: File, folderId: string | null): Promise<VaultFile>;
    update(id: string, patch: Partial<VaultFile>): Promise<void>;
    remove(f: VaultFile): Promise<void>;
    /** A URL the browser can open (signed for 1 hour in live mode). */
    url(f: VaultFile): Promise<string>;
  };
  chunks: {
    replace(fileId: string, pages: string[]): Promise<void>;
    pages(fileId: string): Promise<{ page: number; content: string }[]>;
    search(q: string, onlyFiles?: string[], count?: number): Promise<ChunkHit[]>;
  };
  notes: {
    list(fileId: string): Promise<FileNote[]>;
    create(n: Omit<FileNote, "id" | "created_at">): Promise<FileNote>;
    remove(id: string): Promise<void>;
  };
  chats: {
    list(): Promise<Chat[]>;
    create(c: Partial<Chat>): Promise<Chat>;
    update(id: string, patch: Partial<Chat>): Promise<void>;
    remove(id: string): Promise<void>;
  };
  messages: {
    list(chatId: string): Promise<ChatMessage[]>;
    create(m: Omit<ChatMessage, "id" | "created_at">): Promise<ChatMessage>;
  };
  /** Private calendar feed token (live mode only). */
  icsToken(): Promise<string | null>;
  resetIcsToken(): Promise<string | null>;
}

/* ---------------- live (Supabase) ---------------- */

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

function liveRepo(sb: SupabaseClient): Repo {
  const uid = async () => {
    const { data } = await sb.auth.getUser();
    if (!data.user) throw new Error("not-signed-in");
    return data.user.id;
  };

  return {
    mode: "live",
    events: {
      list: async () => check(await sb.from("events").select("*").order("starts_at")) as CalendarEvent[],
      create: async (e) => check(await sb.from("events").insert(e).select().single()) as CalendarEvent,
      createMany: async (list) =>
        list.length ? (check(await sb.from("events").insert(list).select()) as CalendarEvent[]) : [],
      update: async (id, patch) => void check(await sb.from("events").update(patch).eq("id", id)),
      remove: async (id) => void check(await sb.from("events").delete().eq("id", id)),
    },
    folders: {
      list: async () => check(await sb.from("folders").select("*").order("sort").order("name")) as Folder[],
      create: async (f) => check(await sb.from("folders").insert(f).select().single()) as Folder,
      update: async (id, patch) => void check(await sb.from("folders").update(patch).eq("id", id)),
      remove: async (id) => void check(await sb.from("folders").delete().eq("id", id)),
    },
    files: {
      list: async () => check(await sb.from("files").select("*").order("created_at", { ascending: false })) as VaultFile[],
      get: async (id) => check(await sb.from("files").select("*").eq("id", id).maybeSingle()) as VaultFile | null,
      upload: async (file, folderId) => {
        const id = crypto.randomUUID();
        const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
        const path = `${await uid()}/${id}/${safe}`;
        const up = await sb.storage.from("vault").upload(path, file, { contentType: file.type || undefined });
        if (up.error) throw new Error(up.error.message);
        return check(
          await sb
            .from("files")
            .insert({
              id,
              folder_id: folderId,
              name: file.name,
              mime: file.type || "application/octet-stream",
              size_bytes: file.size,
              storage_path: path,
              status: "processing",
            })
            .select()
            .single(),
        ) as VaultFile;
      },
      update: async (id, patch) => void check(await sb.from("files").update(patch).eq("id", id)),
      remove: async (f) => {
        await sb.storage.from("vault").remove([f.storage_path]);
        check(await sb.from("files").delete().eq("id", f.id));
      },
      url: async (f) => {
        const { data, error } = await sb.storage.from("vault").createSignedUrl(f.storage_path, 3600);
        if (error) throw new Error(error.message);
        return data.signedUrl;
      },
    },
    chunks: {
      replace: async (fileId, pages) => {
        check(await sb.from("file_chunks").delete().eq("file_id", fileId));
        const rows = pages
          .map((content, i) => ({ file_id: fileId, page: i + 1, content }))
          .filter((r) => r.content.trim().length > 0);
        for (let i = 0; i < rows.length; i += 200) check(await sb.from("file_chunks").insert(rows.slice(i, i + 200)));
      },
      pages: async (fileId) =>
        check(await sb.from("file_chunks").select("page, content").eq("file_id", fileId).order("page")) as {
          page: number;
          content: string;
        }[],
      search: async (q, onlyFiles, count = 8) =>
        (check(
          await sb.rpc("search_chunks", { q, only_files: onlyFiles?.length ? onlyFiles : null, match_count: count }),
        ) ?? []) as ChunkHit[],
    },
    notes: {
      list: async (fileId) =>
        check(await sb.from("file_notes").select("*").eq("file_id", fileId).order("page")) as FileNote[],
      create: async (n) => check(await sb.from("file_notes").insert(n).select().single()) as FileNote,
      remove: async (id) => void check(await sb.from("file_notes").delete().eq("id", id)),
    },
    chats: {
      list: async () => check(await sb.from("chats").select("*").order("updated_at", { ascending: false })) as Chat[],
      create: async (c) => check(await sb.from("chats").insert(c).select().single()) as Chat,
      update: async (id, patch) => void check(await sb.from("chats").update(patch).eq("id", id)),
      remove: async (id) => void check(await sb.from("chats").delete().eq("id", id)),
    },
    messages: {
      list: async (chatId) =>
        check(await sb.from("messages").select("*").eq("chat_id", chatId).order("created_at")) as ChatMessage[],
      create: async (m) => check(await sb.from("messages").insert(m).select().single()) as ChatMessage,
    },
    icsToken: async () => {
      const id = await uid();
      const row = check(await sb.from("profiles").select("ics_token").eq("id", id).maybeSingle()) as {
        ics_token: string;
      } | null;
      return row?.ics_token ?? null;
    },
    resetIcsToken: async () => {
      const id = await uid();
      const token = crypto.randomUUID();
      check(await sb.from("profiles").update({ ics_token: token }).eq("id", id));
      return token;
    },
  };
}

/* ---------------- demo (this browser) ---------------- */

const KEY = (t: string) => `soussy.demo.${t}`;

function load<T>(table: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(KEY(table)) ?? "[]") as T[];
  } catch {
    return [];
  }
}
function save<T>(table: string, rows: T[]) {
  try {
    localStorage.setItem(KEY(table), JSON.stringify(rows));
  } catch {
    /* storage full or blocked */
  }
}

function table<T extends { id: string }>(name: string) {
  return {
    all: () => load<T>(name),
    insert: (row: T) => {
      save(name, [...load<T>(name), row]);
      return row;
    },
    patch: (id: string, patch: Partial<T>) =>
      save(
        name,
        load<T>(name).map((r) => (r.id === id ? { ...r, ...patch } : r)),
      ),
    remove: (pred: (r: T) => boolean) => save(name, load<T>(name).filter((r) => !pred(r))),
  };
}

const now = () => new Date().toISOString();

/** Same idea as the SQL search: any word of 3+ letters may match; more matches rank higher. */
export function scoreText(q: string, text: string): number {
  const words = Array.from(new Set(q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []));
  if (!words.length) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const w of words) {
    let i = lower.indexOf(w);
    let hits = 0;
    while (i !== -1 && hits < 20) {
      hits++;
      i = lower.indexOf(w, i + w.length);
    }
    if (hits) score += 1 + Math.log(hits);
  }
  return score / Math.sqrt(1 + text.length / 2000);
}

function demoRepo(): Repo {
  const events = table<CalendarEvent>("events");
  const folders = table<Folder>("folders");
  const files = table<VaultFile>("files");
  const chunks = table<{ id: string; file_id: string; page: number; content: string }>("chunks");
  const notes = table<FileNote>("notes");
  const chats = table<Chat>("chats");
  const messages = table<ChatMessage>("messages");

  return {
    mode: "demo",
    events: {
      list: async () => events.all().sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      create: async (e) => events.insert({ ...e, id: crypto.randomUUID(), created_at: now() }),
      createMany: async (list) => list.map((e) => events.insert({ ...e, id: crypto.randomUUID(), created_at: now() })),
      update: async (id, patch) => events.patch(id, patch),
      remove: async (id) => events.remove((e) => e.id === id || e.parent_id === id),
    },
    folders: {
      list: async () => folders.all().sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
      create: async (f) => folders.insert({ ...f, id: crypto.randomUUID() }),
      update: async (id, patch) => folders.patch(id, patch),
      remove: async (id) => {
        const all = folders.all();
        const doomed = new Set([id]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const f of all) {
            if (f.parent_id && doomed.has(f.parent_id) && !doomed.has(f.id)) {
              doomed.add(f.id);
              grew = true;
            }
          }
        }
        folders.remove((f) => doomed.has(f.id));
        files.all().forEach((f) => f.folder_id && doomed.has(f.folder_id) && files.patch(f.id, { folder_id: null }));
      },
    },
    files: {
      list: async () => files.all().sort((a, b) => b.created_at.localeCompare(a.created_at)),
      get: async (id) => files.all().find((f) => f.id === id) ?? null,
      upload: async (file, folderId) => {
        const id = crypto.randomUUID();
        await putBlob(id, file);
        return files.insert({
          id,
          folder_id: folderId,
          name: file.name,
          mime: file.type || "application/octet-stream",
          size_bytes: file.size,
          storage_path: id,
          status: "processing",
          error: null,
          summary: null,
          subject_code: null,
          unit: null,
          topic: null,
          key_terms: [],
          page_count: null,
          created_at: now(),
        });
      },
      update: async (id, patch) => files.patch(id, patch),
      remove: async (f) => {
        await deleteBlob(f.storage_path);
        files.remove((x) => x.id === f.id);
        chunks.remove((c) => c.file_id === f.id);
        notes.remove((n) => n.file_id === f.id);
      },
      url: async (f) => {
        const blob = await getBlob(f.storage_path);
        if (!blob) throw new Error("missing");
        return URL.createObjectURL(blob);
      },
    },
    chunks: {
      replace: async (fileId, pages) => {
        chunks.remove((c) => c.file_id === fileId);
        const rows = load<{ id: string; file_id: string; page: number; content: string }>("chunks");
        pages.forEach((content, i) => content.trim() && rows.push({ id: crypto.randomUUID(), file_id: fileId, page: i + 1, content }));
        save("chunks", rows);
      },
      pages: async (fileId) =>
        chunks
          .all()
          .filter((c) => c.file_id === fileId)
          .sort((a, b) => a.page - b.page)
          .map(({ page, content }) => ({ page, content })),
      search: async (q, onlyFiles, count = 8) => {
        const names = new Map(files.all().map((f) => [f.id, f.name]));
        return chunks
          .all()
          .filter((c) => names.has(c.file_id) && (!onlyFiles?.length || onlyFiles.includes(c.file_id)))
          .map((c) => ({ file_id: c.file_id, file_name: names.get(c.file_id)!, page: c.page, content: c.content, rank: scoreText(q, c.content) }))
          .filter((h) => h.rank > 0)
          .sort((a, b) => b.rank - a.rank)
          .slice(0, count);
      },
    },
    notes: {
      list: async (fileId) => notes.all().filter((n) => n.file_id === fileId).sort((a, b) => a.page - b.page),
      create: async (n) => notes.insert({ ...n, id: crypto.randomUUID(), created_at: now() }),
      remove: async (id) => notes.remove((n) => n.id === id),
    },
    chats: {
      list: async () => chats.all().sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      create: async (c) =>
        chats.insert({
          id: crypto.randomUUID(),
          title: "New chat",
          subject_code: null,
          source_file_ids: [],
          source_urls: [],
          sources_answered: false,
          ...c,
          updated_at: now(),
        }),
      update: async (id, patch) => chats.patch(id, { ...patch, updated_at: now() }),
      remove: async (id) => {
        chats.remove((c) => c.id === id);
        messages.remove((m) => m.chat_id === id);
      },
    },
    messages: {
      list: async (chatId) =>
        messages
          .all()
          .filter((m) => m.chat_id === chatId)
          .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      create: async (m) => {
        chats.patch(m.chat_id, { updated_at: now() });
        return messages.insert({ ...m, id: crypto.randomUUID(), created_at: now() });
      },
    },
    icsToken: async () => null,
    resetIcsToken: async () => null,
  };
}

let repo: Repo | null = null;

export function getRepo(): Repo {
  if (!repo) {
    const sb = getSupabaseBrowser();
    repo = sb ? liveRepo(sb) : demoRepo();
  }
  return repo;
}
