"use client";

import { getPack } from "@/curriculum";
import { unitsFor } from "@/curriculum/units";
import { findMatch } from "@/lib/school/match";
import { getRepo } from "@/lib/data/repo";
import type { Folder, NewEvent, VaultFile } from "@/lib/data/types";
import type { Profile } from "@/lib/profile/types";

/**
 * Study Hub folders, auto-created from onboarding (section 6.1):
 * Subject → Unit → Topic, e.g. Physics HL → Theme C: Wave behaviour → C.5 Doppler effect.
 */
let folderJob: Promise<Folder[]> | null = null;

/** Runs once per page load, even if two screens ask at the same time. */
export function ensureDefaultFolders(profile: Profile): Promise<Folder[]> {
  folderJob ??= makeDefaultFolders(profile).catch((e) => {
    folderJob = null;
    throw e;
  });
  return folderJob.then(() => getRepo().folders.list());
}

async function makeDefaultFolders(profile: Profile): Promise<Folder[]> {
  const repo = getRepo();
  const existing = await repo.folders.list();
  if (existing.length) return existing;
  const pack = getPack(profile.packId);
  const made: Folder[] = [];
  for (const [i, e] of profile.enrollments.entries()) {
    const level = e.level !== "None" ? ` ${e.level}` : "";
    const subject = await repo.folders.create({ parent_id: null, name: `${e.name}${level}`, subject_code: e.subjectId, sort: i });
    made.push(subject);
    for (const [j, u] of unitsFor(pack?.id, e.subjectId).entries()) {
      const unit = await repo.folders.create({ parent_id: subject.id, name: u.name, subject_code: e.subjectId, sort: j });
      made.push(unit);
      for (const [k, topic] of (u.topics ?? []).entries()) {
        made.push(await repo.folders.create({ parent_id: unit.id, name: topic, subject_code: e.subjectId, sort: k }));
      }
    }
  }
  if (pack?.core) {
    for (const [i, part] of pack.core.entries()) {
      made.push(await repo.folders.create({ parent_id: null, name: part === "EE" ? "Extended Essay" : part, subject_code: `core-${part.toLowerCase()}`, sort: 100 + i }));
    }
  }
  return made;
}

export type ProcessOutcome = {
  file: VaultFile;
  note?: string;
  taggedSubject?: string | null;
  tasksFound: number;
  aiOff: boolean;
};

/** Finds the deepest folder matching the AI's subject → unit → topic. */
function bestFolder(folders: Folder[], subject: string | null, unit: string | null, topic: string | null): string | null {
  if (!subject) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const top = folders.find((f) => !f.parent_id && f.subject_code === subject);
  if (!top) return null;
  const kids = (id: string) => folders.filter((f) => f.parent_id === id);
  const match = (list: Folder[], name: string | null) =>
    name ? list.find((f) => norm(f.name).includes(norm(name)) || norm(name).includes(norm(f.name))) : undefined;
  const u = match(kids(top.id), unit);
  if (!u) return top.id;
  const tp = match(kids(u.id), topic);
  return (tp ?? u).id;
}

/**
 * Upload pipeline for one file. Steps that need the AI are skipped (not faked)
 * when it isn't connected, and the file still works for search and viewing.
 */
export async function uploadAndProcess(file: File, folderId: string | null, profile: Profile, onUpdate: (f: VaultFile) => void): Promise<ProcessOutcome> {
  const repo = getRepo();
  let row = await repo.files.upload(file, folderId);
  onUpdate(row);

  // 1. Read the text, page by page.
  let pages: string[] = [];
  let note: string | undefined;
  try {
    const res =
      repo.mode === "live"
        ? await fetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storagePath: row.storage_path, name: row.name, mime: row.mime }),
          })
        : await fetch("/api/extract", { method: "POST", body: (() => { const fd = new FormData(); fd.append("file", file); return fd; })() });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { pages: string[]; note?: string };
    pages = data.pages ?? [];
    note = data.note;
    await repo.chunks.replace(row.id, pages);
  } catch {
    await repo.files.update(row.id, { status: "error", error: "extract_failed" });
    row = { ...row, status: "error", error: "extract_failed" };
    onUpdate(row);
    return { file: row, tasksFound: 0, aiOff: false };
  }

  const patch: Partial<VaultFile> = { status: "ready", page_count: pages.length || null, error: note ?? null };

  // 2. Auto-tag with the small model: subject, unit, topic, summary, key terms, dated tasks.
  let tasksFound = 0;
  let aiOff = false;
  let taggedSubject: string | null = null;
  const text = pages.map((p, i) => `--- page ${i + 1} ---\n${p}`).join("\n").trim();
  if (text) {
    const pack = getPack(profile.packId);
    const subjects = profile.enrollments.map((e) => ({ code: e.subjectId, name: e.name, units: unitsFor(pack?.id, e.subjectId).map((u) => u.name) }));
    const res = await fetch("/api/tag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, text, today: new Date().toISOString().slice(0, 10), subjects }),
    });
    if (res.status === 503) aiOff = true;
    else if (res.ok) {
      const tag = (await res.json()) as {
        subject_code: string | null;
        unit: string | null;
        topic: string | null;
        summary: string;
        key_terms: string[];
        tasks: { title: string; type: NewEvent["type"]; date: string; quote: string; confidence: number }[];
      };
      const valid = profile.enrollments.some((e) => e.subjectId === tag.subject_code) ? tag.subject_code : null;
      Object.assign(patch, { subject_code: valid, unit: tag.unit, topic: tag.topic, summary: tag.summary, key_terms: tag.key_terms.slice(0, 12) });
      taggedSubject = profile.enrollments.find((e) => e.subjectId === valid)?.name ?? null;
      if (!folderId) {
        const target = bestFolder(await repo.folders.list(), valid, tag.unit, tag.topic);
        if (target) patch.folder_id = target;
      }
      // Dates found in the file go to the Review tray, never straight onto the calendar.
      const today = new Date().toISOString().slice(0, 10);
      const existing = await repo.events.list().catch(() => []);
      const tasks = tag.tasks.filter(
        (x) =>
          /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
          x.date >= today &&
          // Already on the calendar (from a lesson, Teams or another file)? Don't add it twice.
          !findMatch(
            { type: x.type, title: x.title, description: x.quote, subject_code: valid, due: new Date(`${x.date}T08:00:00`).toISOString(), all_day: true, origin: { kind: "paste", label: "" }, review: true },
            existing,
          ),
      );
      if (tasks.length) {
        await repo.events.createMany(
          tasks.map((x) => ({
            title: x.title.slice(0, 200),
            type: x.type,
            subject_code: valid,
            starts_at: new Date(`${x.date}T08:00:00`).toISOString(),
            ends_at: null,
            all_day: true,
            description: x.quote,
            location: null,
            dress_code: null,
            estimated_minutes: null,
            source: "file",
            confidence: Math.max(0, Math.min(1, x.confidence)),
            status: "todo",
            in_review: true,
            reminders: [4320, 1440, 0],
            parent_id: null,
            repeat_every_days: null,
            repeat_until: null,
            linked_file_ids: [row.id],
          })),
        );
        tasksFound = tasks.length;
      }
    }
  }

  await repo.files.update(row.id, patch);
  row = { ...row, ...patch } as VaultFile;
  onUpdate(row);
  return { file: row, note, taggedSubject, tasksFound, aiOff };
}

export function formatBytes(n: number, locale: string) {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toLocaleString(locale === "ar" ? "ar-u-nu-latn" : "en", { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`;
}

/** Per-student storage allowance (Supabase free tier is shared by the whole school). */
export const STORAGE_QUOTA = 500 * 1024 * 1024;
