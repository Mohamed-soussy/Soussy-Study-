"use client";

import { useCallback, useEffect, useState } from "react";
import { getRepo } from "@/lib/data/repo";
import type { CalendarEvent, NewEvent } from "@/lib/data/types";

/** Fired when something outside the page (school sync) changed the calendar. */
export const EVENTS_CHANGED = "soussy:events-changed";

/** Loads the student's events and offers create/update/delete with instant (optimistic) updates. */
export function useEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const reload = useCallback(async () => {
    try {
      setEvents(await getRepo().events.list());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener(EVENTS_CHANGED, reload);
    return () => window.removeEventListener(EVENTS_CHANGED, reload);
  }, [reload]);

  const create = useCallback(async (e: NewEvent) => {
    const row = await getRepo().events.create(e);
    setEvents((list) => [...list, row]);
    return row;
  }, []);

  const createMany = useCallback(async (list: NewEvent[]) => {
    const rows = await getRepo().events.createMany(list);
    setEvents((cur) => [...cur, ...rows]);
    return rows;
  }, []);

  const update = useCallback(async (id: string, patch: Partial<CalendarEvent>) => {
    // Ticking off a task earns points once (section 12.4).
    if (patch.status === "done") void import("@/lib/progress/xp").then((m) => m.awardXp("task", 10, id));
    setEvents((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    try {
      await getRepo().events.update(id, patch);
    } catch {
      reload();
    }
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    setEvents((list) => list.filter((e) => e.id !== id && e.parent_id !== id));
    try {
      await getRepo().events.remove(id);
    } catch {
      reload();
    }
  }, [reload]);

  return { events, status, create, createMany, update, remove, reload };
}
