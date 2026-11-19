import type { CalendarEvent, EventType, NewEvent } from "@/lib/data/types";

/** Calendar helpers: dates, repeating classes, workload, milestones and study sprints (section 5). */

export const DAY = 864e5;

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** Local YYYY-MM-DD. */
export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function fromDayKey(k: string) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Week starts on Sunday (school week in Saudi Arabia). */
export function startOfWeek(d: Date) {
  return addDays(startOfDay(d), -d.getDay());
}

/** The 6-week grid shown in month view. */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** One drawn copy of an event; repeating classes produce many. */
export interface Occurrence {
  key: string;
  event: CalendarEvent;
  start: Date;
  end: Date | null;
}

/** Expands repeating events (weekly or N-day rotation) inside [from, to). */
export function occurrences(events: CalendarEvent[], from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (const e of events) {
    if (e.in_review) continue;
    const start = new Date(e.starts_at);
    const end = e.ends_at ? new Date(e.ends_at) : null;
    const len = end ? end.getTime() - start.getTime() : 0;
    if (!e.repeat_every_days) {
      if (start < to && (end ?? start) >= from) out.push({ key: e.id, event: e, start, end });
      continue;
    }
    const until = e.repeat_until ? addDays(new Date(e.repeat_until + "T00:00:00"), 1) : to;
    const step = e.repeat_every_days;
    // jump close to `from`
    let n = Math.max(0, Math.floor((startOfDay(from).getTime() - startOfDay(start).getTime()) / DAY / step) - 1);
    for (let guard = 0; guard < 500; guard++, n++) {
      const s = addDays(start, n * step);
      if (s >= to || s >= until) break;
      if (s >= from || (len && new Date(s.getTime() + len) > from)) {
        out.push({ key: `${e.id}@${n}`, event: e, start: s, end: len ? new Date(s.getTime() + len) : null });
      }
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** How heavy an item is for the workload strip. */
const WEIGHT: Record<EventType, number> = { test: 3, submission: 3, homework: 1, event: 1, class: 0, personal: 0.5 };

/** Load per week (Sunday key) for the workload heatmap. */
export function weeklyLoad(events: CalendarEvent[], from: Date, weeks: number): { week: Date; load: number; count: number }[] {
  const out = Array.from({ length: weeks }, (_, i) => ({ week: addDays(startOfWeek(from), i * 7), load: 0, count: 0 }));
  const to = addDays(out[0].week, weeks * 7);
  for (const o of occurrences(events, out[0].week, to)) {
    if (o.event.status === "done") continue;
    const i = Math.floor((startOfDay(o.start).getTime() - out[0].week.getTime()) / (7 * DAY));
    if (out[i]) {
      out[i].load += WEIGHT[o.event.type];
      if (WEIGHT[o.event.type] > 0) out[i].count += 1;
    }
  }
  return out;
}

/** 0 = calm … 3 = crunch week. */
export function loadLevel(load: number) {
  if (load >= 8) return 3;
  if (load >= 5) return 2;
  if (load >= 2) return 1;
  return 0;
}

function child(parent: CalendarEvent, title: string, date: Date, type: EventType, minutes: number | null, description: string | null): NewEvent {
  const d = new Date(date);
  d.setHours(8, 0, 0, 0);
  return {
    title,
    type,
    subject_code: parent.subject_code,
    starts_at: d.toISOString(),
    ends_at: null,
    all_day: true,
    description,
    location: null,
    dress_code: null,
    estimated_minutes: minutes,
    source: "manual",
    confidence: null,
    status: "todo",
    in_review: false,
    reminders: [1440],
    parent_id: parent.id,
    repeat_every_days: null,
    repeat_until: null,
    linked_file_ids: [],
  };
}

/**
 * Big submissions become a milestone chain, spread back from the deadline (section 5):
 * research question → outline → first draft → teacher feedback → final.
 */
export const MILESTONES = ["Research question", "Outline", "First draft", "Teacher feedback", "Final version"] as const;

export function milestonesFor(parent: CalendarEvent, today = new Date()): NewEvent[] {
  const due = startOfDay(new Date(parent.starts_at));
  const start = startOfDay(today);
  const span = Math.max(Math.round((due.getTime() - start.getTime()) / DAY), MILESTONES.length);
  // share of the time until the deadline at which each milestone lands
  const at = [0.15, 0.35, 0.6, 0.8, 0.95];
  return MILESTONES.slice(0, -1).map((name, i) => {
    const d = addDays(start, Math.max(1, Math.round(span * at[i])));
    return child(parent, `${name}: ${parent.title}`, d < due ? d : addDays(due, -(MILESTONES.length - 1 - i)), "submission", 60, null);
  });
}

/**
 * AI study sprint (section 5): spread short daily tasks across the days left,
 * skipping days that are already full. Units come from the student (and, later,
 * the lesson analyzer and Teams); weak topics from quizzes and flashcards (phase 3).
 */
export interface SprintOptions {
  units: string[];
  weakTopics?: string[];
  maxPerDay?: number;
  today?: Date;
}

const SPRINT_TASKS = [
  { title: (u: string) => `Review notes: ${u}`, minutes: 20 },
  { title: (u: string) => `15 flashcards: ${u}`, minutes: 10 },
  { title: (u: string) => `1 past-paper question: ${u}`, minutes: 15 },
  { title: (u: string) => `Whiteboard explanation: ${u}`, minutes: 10 },
];

export function studySprint(test: CalendarEvent, all: CalendarEvent[], opts: SprintOptions): NewEvent[] {
  const today = startOfDay(opts.today ?? new Date());
  const due = startOfDay(new Date(test.starts_at));
  const maxPerDay = opts.maxPerDay ?? 3;
  const days: Date[] = [];
  for (let d = addDays(today, 1); d < due; d = addDays(d, 1)) days.push(d);
  if (!days.length) days.push(today);

  // How full is each day already?
  const busy = new Map<string, number>();
  for (const o of occurrences(all, today, due)) {
    if (o.event.status === "done") continue;
    busy.set(dayKey(o.start), (busy.get(dayKey(o.start)) ?? 0) + (o.event.type === "class" ? 0 : 1));
  }
  const free = days.filter((d) => (busy.get(dayKey(d)) ?? 0) < maxPerDay);
  const plan = free.length ? free : days;

  // Weak topics come first and get an extra round.
  const units = [...(opts.weakTopics ?? []), ...opts.units].filter(Boolean);
  const topics = units.length ? units : [test.description || test.title];
  const out: NewEvent[] = [];
  plan.forEach((d, i) => {
    const unit = topics[i % topics.length];
    const task = SPRINT_TASKS[i % SPRINT_TASKS.length];
    out.push(child(test, task.title(unit), d, "personal", task.minutes, `Study sprint for ${test.title}`));
  });
  // Last day: a quick mixed review.
  if (plan.length > 1) {
    out.push(child(test, `Mixed review: ${topics.slice(0, 3).join(", ")}`, plan[plan.length - 1], "personal", 25, `Study sprint for ${test.title}`));
  }
  return out;
}

/** Moves unfinished sprint tasks from missed days onto the remaining days (re-balance). */
export function rebalance(tasks: CalendarEvent[], due: Date, today = new Date()): { id: string; starts_at: string }[] {
  const start = startOfDay(today);
  const missed = tasks.filter((t) => t.status !== "done" && startOfDay(new Date(t.starts_at)) < start);
  if (!missed.length) return [];
  const days: Date[] = [];
  for (let d = start; d < startOfDay(due); d = addDays(d, 1)) days.push(d);
  if (!days.length) return [];
  return missed.map((t, i) => {
    const d = new Date(days[i % days.length]);
    d.setHours(8, 0, 0, 0);
    return { id: t.id, starts_at: d.toISOString() };
  });
}

/* ---------------- .ics export ---------------- */

function icsDate(d: Date, allDay: boolean) {
  if (allDay) return `;VALUE=DATE:${dayKey(d).replace(/-/g, "")}`;
  return `:${d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
}
function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545 calendar text for Google Calendar, Outlook and Apple Calendar. */
export function toIcs(events: CalendarEvent[], name = "Soussy Study"): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Soussy Study//Calendar//EN", `X-WR-CALNAME:${esc(name)}`, "CALSCALE:GREGORIAN"];
  for (const e of events) {
    const start = new Date(e.starts_at);
    lines.push("BEGIN:VEVENT", `UID:${e.id}@soussy.study`, `DTSTAMP${icsDate(new Date(), false)}`);
    lines.push(`DTSTART${icsDate(start, e.all_day)}`);
    if (e.all_day) lines.push(`DTEND${icsDate(addDays(start, 1), true)}`);
    else if (e.ends_at) lines.push(`DTEND${icsDate(new Date(e.ends_at), false)}`);
    lines.push(`SUMMARY:${esc(e.title)}`, `CATEGORIES:${e.type.toUpperCase()}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.repeat_every_days) {
      const until = e.repeat_until ? `;UNTIL=${e.repeat_until.replace(/-/g, "")}` : "";
      lines.push(e.repeat_every_days % 7 === 0 ? `RRULE:FREQ=WEEKLY;INTERVAL=${e.repeat_every_days / 7}${until}` : `RRULE:FREQ=DAILY;INTERVAL=${e.repeat_every_days}${until}`);
    }
    if (e.status === "done") lines.push("STATUS:CONFIRMED");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
