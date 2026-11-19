"use client";

import { getRepo } from "@/lib/data/repo";
import type { CalendarEvent } from "@/lib/data/types";
import { EVENTS_CHANGED } from "@/lib/calendar/use-events";
import { planCounts, planItems, type Plan, type SchoolItem } from "./match";

/**
 * Puts school items on the calendar: new ones (or into the Review tray), updates from a
 * re-sync, merges with the same task from another source, and date conflicts to settle.
 * Returns what happened plus the event id each item ended up in.
 */
export async function applySchoolItems(items: SchoolItem[], current?: CalendarEvent[]) {
  const repo = getRepo();
  const events = current ?? (await repo.events.list());
  const plans = planItems(items, events);
  const ids = new Map<SchoolItem, string>();

  const creates = plans.filter((p): p is Extract<Plan, { action: "create" | "conflict" }> => p.action === "create" || p.action === "conflict");
  const rows = creates.length ? await repo.events.createMany(creates.map((p) => p.event)) : [];
  creates.forEach((p, i) => rows[i] && ids.set(p.item, rows[i].id));

  for (const p of plans) {
    if (p.action === "update" || p.action === "merge") {
      await repo.events.update(p.id, p.patch);
      ids.set(p.item, p.id);
    }
  }
  // Items folded into another item of the same batch, or already flagged: find their row.
  for (const it of items) {
    if (ids.has(it)) continue;
    const same = it.external_id ? events.find((e) => e.external_id === it.external_id) : undefined;
    if (same) ids.set(it, same.id);
  }
  if (plans.length) announceChange();
  return { counts: planCounts(plans), plans, ids };
}

/**
 * Settles a date conflict from the Review tray. "theirs" moves the saved item to the new
 * date; "mine" keeps the saved date. Either way both sources end up on the one item.
 */
export async function resolveConflict(conflict: CalendarEvent, original: CalendarEvent, keep: "theirs" | "mine") {
  const repo = getRepo();
  const origins = [...(original.origins ?? [])];
  for (const o of conflict.origins ?? []) if (!origins.some((x) => x.kind === o.kind && x.href === o.href)) origins.push(o);
  await repo.events.update(original.id, keep === "theirs" ? { origins, starts_at: conflict.starts_at } : { origins });
  await repo.events.remove(conflict.id);
  announceChange();
}

/** Tells open calendar views that school items changed (they reload). */
export function announceChange() {
  window.dispatchEvent(new Event(EVENTS_CHANGED));
}
