"use client";

import { detectSubject } from "@/lib/calendar/quick-add";
import type { EventType } from "@/lib/data/types";
import { getRepo5, type Connection } from "@/lib/lessons/repo";
import type { Enrollment } from "@/lib/profile/types";
import type { PasteOut } from "@/prompts/lesson.v1";
import { applySchoolItems } from "./apply";
import { resolveDue } from "./dates";
import type { IcsEvent } from "./ics";
import { icsToItems, msToItems, type MsSync } from "./normalize";

export { icsToItems, msToItems, type MsFile, type MsSync } from "./normalize";
import type { SchoolItem } from "./match";

/**
 * Keeps school connections fresh (section 10.2): every 30 minutes while the app is open,
 * on app open, and when the student taps Sync. Each source becomes SchoolItems, and one
 * shared step puts them on the calendar.
 */

export const SYNC_EVERY_MS = 30 * 60 * 1000;

export type SyncResult = { created: number; updated: number; merged: number; conflicts: number };

async function json<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!res.ok) throw Object.assign(new Error(data.message ?? data.error ?? `HTTP ${res.status}`), { code: data.error });
  return data;
}

/* ---------- .ics feeds ---------- */

export async function syncIcs(conn: Connection, enrollments: Enrollment[]): Promise<SyncResult> {
  const repo5 = getRepo5();
  try {
    const data = await json<{ name: string; events: IcsEvent[] }>(
      await fetch("/api/school/ics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: conn.url }) }),
    );
    const muted = new Set(conn.settings.mutedClasses ?? []);
    const items = icsToItems(data.events, conn, enrollments).filter((i) => !i.subject_code || !muted.has(i.subject_code));
    const { counts } = await applySchoolItems(items);
    await repo5.connections.update(conn.id, { last_sync: new Date().toISOString(), last_error: null, ...(conn.label ? {} : { label: data.name || "Calendar feed" }) });
    return counts;
  } catch (err) {
    await repo5.connections.update(conn.id, { last_error: err instanceof Error ? err.message : "Sync failed" }).catch(() => {});
    throw err;
  }
}

/* ---------- Microsoft (Teams, Outlook, OneDrive) ---------- */

const MS_CACHE = "soussy.ms.last";
/** The last sync's file list and statuses, for the Connections card (this device only). */
export function lastMsSync(): (MsSync & { at: string }) | null {
  try {
    return JSON.parse(localStorage.getItem(MS_CACHE) ?? "null");
  } catch {
    return null;
  }
}

export async function syncMicrosoft(conn: Connection, enrollments: Enrollment[]): Promise<SyncResult & { data: MsSync }> {
  const repo5 = getRepo5();
  try {
    const data = await json<MsSync>(
      await fetch("/api/microsoft/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendar: conn.settings.calendar !== false, assignments: conn.settings.assignments !== false, files: conn.settings.files !== false }),
      }),
    );
    const { counts } = await applySchoolItems(msToItems(data, conn, enrollments));
    try {
      localStorage.setItem(MS_CACHE, JSON.stringify({ ...data, at: new Date().toISOString() }));
    } catch {
      /* storage full */
    }
    await repo5.connections.update(conn.id, { last_sync: new Date().toISOString(), last_error: null });
    return { ...counts, data };
  } catch (err) {
    await repo5.connections.update(conn.id, { last_error: err instanceof Error ? err.message : "Sync failed" }).catch(() => {});
    throw err;
  }
}

/* ---------- everything, on a timer ---------- */

const LOCK = "soussy.school.syncing";

/** Syncs every connection older than 30 minutes (or all, when forced). One tab at a time. */
export async function syncAll(enrollments: Enrollment[], force = false): Promise<SyncResult> {
  const total: SyncResult = { created: 0, updated: 0, merged: 0, conflicts: 0 };
  try {
    const held = Number(localStorage.getItem(LOCK) ?? 0);
    if (!force && Date.now() - held < 120_000) return total;
    localStorage.setItem(LOCK, String(Date.now()));
  } catch {
    /* no storage: just sync */
  }
  try {
    const conns = await getRepo5().connections.list();
    for (const c of conns) {
      if (!force && c.last_sync && Date.now() - new Date(c.last_sync).getTime() < SYNC_EVERY_MS) continue;
      try {
        const r = c.provider === "ics" ? await syncIcs(c, enrollments) : await syncMicrosoft(c, enrollments);
        total.created += r.created;
        total.updated += r.updated;
        total.merged += r.merged;
        total.conflicts += r.conflicts;
      } catch {
        /* the error is saved on the connection and shown on its card */
      }
    }
  } finally {
    try {
      localStorage.removeItem(LOCK);
    } catch {
      /* ignore */
    }
  }
  return total;
}

/* ---------- pasted text ---------- */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Paste from school": the AI finds tasks and dates; they land in "New from school". */
export async function importPasted(text: string, enrollments: Enrollment[]): Promise<SyncResult & { found: number }> {
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const data = await json<PasteOut>(
    await fetch("/api/school/paste", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, today: ymd, weekday: WEEKDAYS[today.getDay()] }) }),
  );
  const KIND: Record<string, EventType> = { homework: "homework", test: "test", deadline: "submission", announcement: "event" };
  const items: SchoolItem[] = data.items.map((i) => {
    const due = resolveDue(i.due_text, i.due_date, today);
    return {
      type: KIND[i.kind] ?? "homework",
      title: i.title.slice(0, 200),
      subject_code: detectSubject(`${i.subject} ${i.title}`, enrollments)?.code ?? null,
      due: (due.date ?? new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)).toISOString(),
      all_day: true,
      description: i.details || null,
      origin: { kind: "paste", label: "Pasted from school" },
      confidence: Math.round(i.confidence * due.certainty * (due.date ? 1 : 0.6) * 100) / 100,
      review: true,
    };
  });
  const { counts } = await applySchoolItems(items);
  return { ...counts, found: items.length };
}
