import { detectSubject, detectType } from "@/lib/calendar/quick-add";
import type { EventType } from "@/lib/data/types";
import type { Connection } from "@/lib/lessons/repo";
import type { Enrollment } from "@/lib/profile/types";
import type { IcsEvent } from "./ics";
import type { SchoolItem } from "./match";

/** Turns what each school source returns into SchoolItems (browser and server). */

export const CLASS_WORDS = /\b(period|lesson|class|block|lecture|tutorial|homeroom|advisory)\b|حصة/i;

export function icsToItems(events: IcsEvent[], conn: Pick<Connection, "id" | "label" | "url">, enrollments: Enrollment[]): SchoolItem[] {
  return events.map((e) => {
    const text = `${e.summary} ${e.location}`;
    const subject = detectSubject(text, enrollments);
    const found = detectType(e.summary);
    // A repeating timed slot with a subject is a class; a one-off is an event unless it says test/homework.
    const type: EventType = found && found !== "personal" ? found : e.repeatEveryDays && !e.allDay ? "class" : CLASS_WORDS.test(e.summary) ? "class" : "event";
    return {
      type,
      title: e.summary,
      subject_code: subject?.code ?? null,
      due: e.start,
      ends: e.end,
      all_day: e.allDay,
      description: e.description || null,
      location: e.location || null,
      origin: { kind: "ics", label: conn.label || "Calendar feed", href: e.url || undefined },
      external_id: `ics:${conn.id}:${e.uid}`.slice(0, 300),
      // Classes and events just appear; tasks wait for a tap in "New from school".
      review: ["homework", "test", "submission"].includes(type),
      repeat_every_days: e.repeatEveryDays,
      repeat_until: e.repeatUntil,
    };
  });
}

export interface MsFile {
  id: string;
  name: string;
  size: number;
  webUrl: string;
  modified: string;
  mime: string;
}

type Part<T> = { status: "ok" | "off" | "needs_approval" | "error"; items: T[]; message?: string };
export interface MsSync {
  calendar: Part<{ id: string; subject: string; start: string; end: string; allDay: boolean; location: string; webLink: string; online: boolean; preview: string; joinUrl?: string }>;
  assignments: Part<{ id: string; title: string; due: string | null; classId: string; className: string; instructions: string; webUrl: string; submitted: boolean }>;
  files: Part<MsFile>;
  classes: { id: string; name: string }[];
  /** Level 3: class transcripts added to Lessons. */
  transcripts?: { added: number; blocked?: string } | null;
}

export function msToItems(data: MsSync, conn: Connection, enrollments: Enrollment[]): SchoolItem[] {
  const muted = new Set(conn.settings.mutedClasses ?? []);
  const items: SchoolItem[] = [];
  for (const a of data.assignments.items) {
    if (muted.has(a.classId)) continue;
    const subject = detectSubject(`${a.className} ${a.title}`, enrollments);
    const found = detectType(a.title);
    items.push({
      type: found === "test" || found === "submission" ? found : "homework",
      title: a.title,
      subject_code: subject?.code ?? null,
      due: a.due,
      all_day: false,
      description: a.instructions || null,
      origin: { kind: "teams", label: a.className ? `Teams · ${a.className}` : "Teams", href: a.webUrl || undefined },
      external_id: `ms:assignment:${a.id}`,
      review: true,
      status: a.submitted ? "done" : undefined,
    });
  }
  for (const e of data.calendar.items) {
    const subject = detectSubject(e.subject, enrollments);
    const found = detectType(e.subject);
    items.push({
      type: found === "test" ? "test" : e.online || CLASS_WORDS.test(e.subject) || subject ? "class" : "event",
      title: e.subject || "(untitled)",
      subject_code: subject?.code ?? null,
      due: e.allDay ? new Date(`${e.start.slice(0, 10)}T00:00:00`).toISOString() : e.start,
      ends: e.allDay ? null : e.end,
      all_day: e.allDay,
      description: e.preview || null,
      location: e.location || null,
      origin: { kind: "outlook", label: "Outlook", href: e.webLink || undefined },
      external_id: `ms:event:${e.id}`.slice(0, 300),
      review: found === "test",
    });
  }
  return items.filter((i) => i.due);
}

