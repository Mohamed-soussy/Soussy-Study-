"use client";

import { useSyncExternalStore } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * The study session behind the timer bubble (section 12A.1), shared by the bubble,
 * the Focus room and linked devices (section 4A).
 *
 * Time is stored as timestamps on SERVER time (not a ticking counter), so every
 * device computes the same "time left" and a session survives reloads, sleep and
 * even another day (emergency pause). On conflict, the newest change wins.
 */

export interface Unit {
  id: string;
  name: string;
  subject: string | null;
  minutes: number;
  /** Time actually spent, filled in when the unit ends. */
  actualMs: number;
  done: boolean;
}

export type Status = "idle" | "running" | "paused" | "break" | "emergency" | "done";

export interface SessionState {
  status: Status;
  units: Unit[];
  index: number;
  /** Server time when the current running stretch began. */
  runStartedAt: number | null;
  /** Time already spent in the current unit before runStartedAt. */
  unitAccumMs: number;
  /** Total running time (for the focus score). */
  focusedMs: number;
  /** Time paused or in emergency (for the focus score). */
  pausedMs: number;
  pausedAt: number | null;
  breakBankMs: number;
  breakUsedMs: number;
  breakStartedAt: number | null;
  breakLengthMs: number;
  /** Which warnings already fired for the current unit (2-minute ping, 100%, 150%). */
  warned: { two: boolean; full: boolean; over: boolean };
  sessionStartedAt: number | null;
  finishedAt: number | null;
  updatedAt: number;
  by: string;
}

const KEY = "soussy.session";
const IDLE: SessionState = {
  status: "idle",
  units: [],
  index: 0,
  runStartedAt: null,
  unitAccumMs: 0,
  focusedMs: 0,
  pausedMs: 0,
  pausedAt: null,
  breakBankMs: 0,
  breakUsedMs: 0,
  breakStartedAt: null,
  breakLengthMs: 0,
  warned: { two: false, full: false, over: false },
  sessionStartedAt: null,
  finishedAt: null,
  updatedAt: 0,
  by: "",
};

/* ---------- server time ---------- */

let offset = 0;
let synced = false;
/** Learns the difference between this device's clock and the server's (once per page load). */
export async function syncServerTime() {
  if (synced || typeof window === "undefined") return;
  synced = true;
  try {
    const t0 = Date.now();
    const res = await fetch("/api/time", { cache: "no-store" });
    const { now } = (await res.json()) as { now: number };
    offset = now + (Date.now() - t0) / 2 - Date.now();
  } catch {
    offset = 0;
  }
}
export const serverNow = () => Date.now() + offset;

/* ---------- device id ---------- */

export function deviceId(): string {
  try {
    // Demo mode has no accounts: each browser tab acts as its own "device" so linking can be tried.
    const store = isSupabaseConfigured ? localStorage : sessionStorage;
    let id = store.getItem("soussy.device.id");
    if (!id) {
      id = crypto.randomUUID();
      store.setItem("soussy.device.id", id);
    }
    return id;
  } catch {
    return "this-device";
  }
}

/* ---------- store ---------- */

let state: SessionState = IDLE;
let loaded = false;
const listeners = new Set<() => void>();
/** Called whenever this device changes the session (linked devices hook in here). */
const outbound = new Set<(s: SessionState) => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...IDLE, ...(JSON.parse(raw) as SessionState) };
  } catch {
    /* keep idle */
  }
  window.addEventListener("storage", (e) => {
    if (e.key === KEY && e.newValue) receive(JSON.parse(e.newValue) as SessionState);
  });
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function emit() {
  listeners.forEach((l) => l());
}

function commit(next: SessionState) {
  state = { ...next, updatedAt: serverNow(), by: deviceId() };
  persist();
  emit();
  outbound.forEach((f) => f(state));
}

/** A newer session from another tab or a linked device. Last change wins. */
export function receive(remote: SessionState) {
  load();
  if (remote.updatedAt <= state.updatedAt) return;
  state = remote;
  persist();
  emit();
}

export function onLocalChange(f: (s: SessionState) => void): () => void {
  outbound.add(f);
  return () => void outbound.delete(f);
}

export function getSession(): SessionState {
  load();
  return state;
}

export function useSession(): SessionState {
  return useSyncExternalStore(
    (l) => {
      load();
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => getSession(),
    () => IDLE,
  );
}

/* ---------- derived values ---------- */

export function elapsedMs(s: SessionState, now = serverNow()) {
  return s.unitAccumMs + (s.status === "running" && s.runStartedAt ? now - s.runStartedAt : 0);
}
export function currentUnit(s: SessionState): Unit | null {
  return s.units[s.index] ?? null;
}
export function plannedMs(s: SessionState) {
  return (currentUnit(s)?.minutes ?? 0) * 60_000;
}
export function breakLeftMs(s: SessionState, now = serverNow()) {
  return s.status === "break" && s.breakStartedAt ? Math.max(0, s.breakLengthMs - (now - s.breakStartedAt)) : 0;
}
export function breakBankLeftMs(s: SessionState) {
  return Math.max(0, s.breakBankMs - s.breakUsedMs);
}
/** When the whole plan will end if nothing changes. */
export function projectedFinish(s: SessionState, now = serverNow()) {
  const cur = Math.max(0, plannedMs(s) - elapsedMs(s, now));
  const rest = s.units.slice(s.index + 1).reduce((a, u) => a + u.minutes * 60_000, 0);
  return now + cur + rest;
}
/** Share of the session spent focused (running) rather than paused. */
export function focusScore(s: SessionState) {
  const total = s.focusedMs + s.pausedMs;
  return total ? Math.round((s.focusedMs / total) * 100) : 100;
}

/* ---------- actions ---------- */

/** Ends the current running stretch, adding its time to the unit and the session. */
function settle(s: SessionState, now: number): SessionState {
  if (s.status === "running" && s.runStartedAt) {
    const d = now - s.runStartedAt;
    return { ...s, unitAccumMs: s.unitAccumMs + d, focusedMs: s.focusedMs + d, runStartedAt: null };
  }
  if ((s.status === "paused" || s.status === "emergency") && s.pausedAt) {
    return { ...s, pausedMs: s.pausedMs + (now - s.pausedAt), pausedAt: null };
  }
  if (s.status === "break" && s.breakStartedAt) {
    return { ...s, breakUsedMs: s.breakUsedMs + Math.min(s.breakLengthMs, now - s.breakStartedAt), breakStartedAt: null };
  }
  return s;
}

function logMinutes(min: number) {
  try {
    const log = JSON.parse(localStorage.getItem("soussy.focus.log") ?? "[]") as { d: string; m: number }[];
    log.push({ d: new Date().toISOString().slice(0, 10), m: Math.round(min) });
    localStorage.setItem("soussy.focus.log", JSON.stringify(log.slice(-200)));
  } catch {
    /* ignore */
  }
}

export const session = {
  start(units: Omit<Unit, "id" | "actualMs" | "done">[], breakBankMinutes = 0) {
    const now = serverNow();
    commit({
      ...IDLE,
      status: "running",
      units: units.map((u) => ({ ...u, id: crypto.randomUUID(), actualMs: 0, done: false })),
      runStartedAt: now,
      breakBankMs: breakBankMinutes * 60_000,
      sessionStartedAt: now,
      updatedAt: now,
      by: deviceId(),
    });
  },
  pause() {
    const s = getSession();
    if (s.status !== "running") return;
    const now = serverNow();
    commit({ ...settle(s, now), status: "paused", pausedAt: now });
  },
  /** "Lock in": resume from pause, emergency or a break. */
  resume() {
    const s = getSession();
    if (!["paused", "emergency", "break"].includes(s.status)) return;
    const now = serverNow();
    commit({ ...settle(s, now), status: "running", runStartedAt: now });
  },
  emergency() {
    const s = getSession();
    if (s.status === "idle" || s.status === "done") return;
    const now = serverNow();
    commit({ ...settle(s, now), status: "emergency", pausedAt: now });
  },
  addFive() {
    const s = getSession();
    const u = currentUnit(s);
    if (!u) return;
    commit({ ...s, units: s.units.map((x, i) => (i === s.index ? { ...x, minutes: x.minutes + 5 } : x)), warned: { two: false, full: false, over: false } });
  },
  takeBreak(minutes: number) {
    const s = getSession();
    if (s.status === "idle" || s.status === "done") return;
    const now = serverNow();
    commit({ ...settle(s, now), status: "break", breakStartedAt: now, breakLengthMs: minutes * 60_000 });
  },
  next() {
    const s = getSession();
    const now = serverNow();
    const settled = settle(s, now);
    const units = settled.units.map((u, i) => (i === s.index ? { ...u, actualMs: settled.unitAccumMs, done: true } : u));
    if (s.index + 1 >= units.length) {
      logMinutes(settled.focusedMs / 60000);
      commit({ ...settled, units, status: "done", finishedAt: now });
      return;
    }
    commit({
      ...settled,
      units,
      index: s.index + 1,
      unitAccumMs: 0,
      status: "running",
      runStartedAt: now,
      warned: { two: false, full: false, over: false },
    });
  },
  finish() {
    const s = getSession();
    if (s.status === "idle" || s.status === "done") return;
    const now = serverNow();
    const settled = settle(s, now);
    const units = settled.units.map((u, i) => (i === s.index ? { ...u, actualMs: settled.unitAccumMs, done: true } : u));
    logMinutes(settled.focusedMs / 60000);
    commit({ ...settled, units, status: "done", finishedAt: now });
  },
  clear() {
    commit({ ...IDLE });
  },
  addUnit(u: Omit<Unit, "id" | "actualMs" | "done">) {
    const s = getSession();
    commit({ ...s, units: [...s.units, { ...u, id: crypto.randomUUID(), actualMs: 0, done: false }] });
  },
  removeUnit(id: string) {
    const s = getSession();
    const i = s.units.findIndex((u) => u.id === id);
    if (i <= s.index) return; // can't remove the current or finished units
    commit({ ...s, units: s.units.filter((u) => u.id !== id) });
  },
  markWarned(k: keyof SessionState["warned"]) {
    const s = getSession();
    commit({ ...s, warned: { ...s.warned, [k]: true } });
  },
  /** When a break runs out, go back to the unit. */
  endBreakIfOver() {
    const s = getSession();
    if (s.status === "break" && breakLeftMs(s) <= 0) session.resume();
  },
};
