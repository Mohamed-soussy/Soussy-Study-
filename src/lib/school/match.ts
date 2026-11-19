import { addDays, sameDay, startOfDay } from "@/lib/calendar/logic";
import type { CalendarEvent, EventSource, EventStatus, EventType, NewEvent, Origin } from "@/lib/data/types";

/**
 * The connector layer (section 10.3). Every school source (a lesson recording, a calendar
 * feed, Microsoft Teams, pasted text) turns what it found into this one shape, so the rest
 * of the app never needs to know where an item came from.
 */
export interface SchoolItem {
  type: EventType;
  title: string;
  subject_code: string | null;
  /** ISO date or date-time; null when the source gave no date. */
  due: string | null;
  all_day: boolean;
  ends?: string | null;
  description?: string | null;
  location?: string | null;
  origin: Origin;
  /** Stable id in the other system, e.g. "ics:<uid>" or "ms:assignment:<id>". */
  external_id?: string | null;
  /** 0–1, for AI-found items. */
  confidence?: number | null;
  /** true: wait in the Review tray for one tap. false: goes straight onto the calendar. */
  review: boolean;
  repeat_every_days?: number | null;
  repeat_until?: string | null;
  /** e.g. "done" when Teams shows the work was handed in. */
  status?: EventStatus;
}

export type MatchStatus = "new" | "same" | "different";

/** Words that don't help tell two tasks apart. */
const STOP = new Set(
  "the a an and or of on for to in at by do does from with your you our is are be this that these those please page pages p pg question questions q qs ex exercise exercises homework hw task assignment due test quiz exam class lesson read reading finish complete".split(
    " ",
  ),
);

function words(s: string): string[] {
  return stripDates(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
}

/** Dates and times ("2026-11-19", "19/11", "6:01") are not page or question numbers. */
const stripDates = (s: string) => s.replace(/\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b|\b\d{1,2}:\d{2}\b/g, " ");

/** Page and question numbers ("page 45", "1-3") are the strongest sign two tasks are the same. */
function numbers(s: string): string[] {
  return (stripDates(s).match(/\d+/g) ?? []).filter((n) => n.length <= 3);
}

/** 0–1 similarity of two task descriptions. */
export function similarity(a: string, b: string): number {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  const na = new Set(numbers(a));
  const nb = new Set(numbers(b));
  const inter = (x: Set<string>, y: Set<string>) => [...x].filter((v) => y.has(v)).length;
  const union = (x: Set<string>, y: Set<string>) => new Set([...x, ...y]).size;
  const w = union(wa, wb) ? inter(wa, wb) / union(wa, wb) : 0;
  const n = union(na, nb) ? inter(na, nb) / union(na, nb) : 0;
  // Shared numbers count double: "Q1-3 p45" vs "page 45 questions 1 to 3" share no words.
  if (na.size && nb.size) return Math.min(1, w * 0.5 + n * 0.7);
  return w;
}

const TASKLIKE: EventType[] = ["homework", "test", "submission"];
const compatible = (a: EventType, b: EventType) => a === b || (TASKLIKE.includes(a) && TASKLIKE.includes(b));

/**
 * Looks for the same task already saved: same subject (or one side unknown), similar
 * words, and due within three weeks of each other.
 */
export function findMatch(item: SchoolItem, events: CalendarEvent[]): { event: CalendarEvent; status: Exclude<MatchStatus, "new"> } | null {
  if (item.external_id) {
    const same = events.find((e) => e.external_id === item.external_id);
    if (same) return { event: same, status: item.due && !sameDay(new Date(same.starts_at), new Date(item.due)) ? "different" : "same" };
  }
  if (!item.due || item.type === "class") return null;
  const due = new Date(item.due);
  let best: { event: CalendarEvent; score: number } | null = null;
  for (const e of events) {
    if (e.conflict_of || e.parent_id || !compatible(e.type, item.type)) continue;
    if (item.subject_code && e.subject_code && item.subject_code !== e.subject_code) continue;
    const days = Math.abs(startOfDay(new Date(e.starts_at)).getTime() - startOfDay(due).getTime()) / 864e5;
    if (days > 21) continue;
    const quotes = (e.origins ?? []).map((o) => o.quote ?? "").join(" ");
    const score = Math.max(similarity(item.title, e.title), similarity(`${item.title} ${item.description ?? ""}`, `${e.title} ${e.description ?? ""} ${quotes}`));
    if (score >= 0.45 && (!best || score > best.score)) best = { event: e, score };
  }
  if (!best) return null;
  return { event: best.event, status: sameDay(new Date(best.event.starts_at), due) ? "same" : "different" };
}

const SOURCE: Record<Origin["kind"], EventSource> = { lesson: "lesson", teams: "teams", outlook: "teams", ics: "platform", paste: "ai" };

/** Adds an origin unless the same one is already there. */
export function withOrigin(list: Origin[] | undefined, o: Origin): Origin[] {
  const cur = list ?? [];
  return cur.some((x) => x.kind === o.kind && (x.href ?? x.label) === (o.href ?? o.label)) ? cur : [...cur, o];
}

/** The calendar row for a school item that matched nothing. */
export function toNewEvent(item: SchoolItem): NewEvent {
  return {
    title: item.title.slice(0, 200),
    type: item.type,
    subject_code: item.subject_code,
    starts_at: item.due ?? startOfDay(addDays(new Date(), 1)).toISOString(),
    ends_at: item.ends ?? null,
    all_day: item.all_day,
    description: item.description ?? null,
    location: item.location ?? null,
    dress_code: null,
    estimated_minutes: null,
    source: SOURCE[item.origin.kind],
    confidence: item.confidence ?? null,
    status: item.status ?? "todo",
    in_review: item.review && item.status !== "done",
    reminders: item.type === "class" ? [] : [4320, 1440, 0],
    parent_id: null,
    repeat_every_days: item.repeat_every_days ?? null,
    repeat_until: item.repeat_until ?? null,
    linked_file_ids: [],
    external_id: item.external_id ?? null,
    origins: [{ ...item.origin, due: item.due ?? undefined }],
  };
}

export type Plan =
  | { action: "create"; item: SchoolItem; event: NewEvent }
  | { action: "update"; item: SchoolItem; id: string; patch: Partial<CalendarEvent> }
  | { action: "merge"; item: SchoolItem; id: string; patch: Partial<CalendarEvent> }
  | { action: "conflict"; item: SchoolItem; with: CalendarEvent; event: NewEvent };

/**
 * Decides what each item does to the calendar, without touching it:
 *  - same external id → update it (a re-sync, e.g. Teams changed the title);
 *  - same task from another source on the same day → merge (one item, both sources);
 *  - same task, different day → a conflict the student settles in the Review tray;
 *  - otherwise → a new item.
 */
export function planItems(items: SchoolItem[], events: CalendarEvent[]): Plan[] {
  const working = [...events];
  const plans: Plan[] = [];
  for (const item of items) {
    const byId = item.external_id ? working.find((e) => e.external_id === item.external_id) : undefined;
    if (byId?.id.startsWith("pending-")) continue; // the same item twice in one batch
    if (byId) {
      const patch: Partial<CalendarEvent> = {};
      if (item.title && item.title !== byId.title) patch.title = item.title.slice(0, 200);
      if (item.due && item.due !== byId.starts_at) patch.starts_at = item.due;
      if ((item.description ?? null) !== (byId.description ?? null) && item.description) patch.description = item.description;
      if (item.ends !== undefined && item.ends !== byId.ends_at) patch.ends_at = item.ends ?? null;
      // Handed in on Teams: tick it off here too (never the other way round).
      if (item.status === "done" && byId.status !== "done") patch.status = "done";
      if (Object.keys(patch).length) plans.push({ action: "update", item, id: byId.id, patch });
      continue;
    }
    const m = findMatch(item, working);
    if (m?.status === "same" && m.event.id.startsWith("pending-")) {
      // Two sources in this same batch: fold into the item about to be created.
      const p = plans[Number(m.event.id.slice(8)) - 1];
      if (p && p.action !== "update" && p.action !== "merge") p.event.origins = withOrigin(p.event.origins, { ...item.origin, due: item.due ?? undefined });
      continue;
    }
    if (m?.status === "same") {
      const origins = withOrigin(m.event.origins, { ...item.origin, due: item.due ?? undefined });
      const patch: Partial<CalendarEvent> = { origins };
      if (item.external_id && !m.event.external_id) patch.external_id = item.external_id;
      // Teams knows the class's real wording and attachments; keep the student's own title.
      if (!m.event.description && item.description) patch.description = item.description;
      plans.push({ action: "merge", item, id: m.event.id, patch });
      Object.assign(m.event, patch);
      continue;
    }
    if (m?.status === "different" && m.event.id.startsWith("pending-")) continue;
    if (m?.status === "different") {
      // Already flagged for this exact source? Don't raise it twice.
      const flagged = working.some((e) => e.conflict_of === m.event.id && (e.origins ?? []).some((o) => o.kind === item.origin.kind && o.href === item.origin.href));
      if (!flagged) {
        const event = { ...toNewEvent(item), in_review: true, conflict_of: m.event.id, external_id: null };
        plans.push({ action: "conflict", item, with: m.event, event });
        working.push({ ...event, id: `pending-${plans.length}` } as CalendarEvent);
      }
      continue;
    }
    const event = toNewEvent(item);
    plans.push({ action: "create", item, event });
    working.push({ ...event, id: `pending-${plans.length}` } as CalendarEvent);
  }
  return plans;
}

/** What a set of plans did, for "3 new · 1 merged · 1 date differs". */
export function planCounts(plans: Plan[]) {
  return {
    created: plans.filter((p) => p.action === "create").length,
    updated: plans.filter((p) => p.action === "update").length,
    merged: plans.filter((p) => p.action === "merge").length,
    conflicts: plans.filter((p) => p.action === "conflict").length,
  };
}
