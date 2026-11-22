/**
 * Focus rules (section 12A.2). Pure functions: given the camera signals over
 * time and whether the student is active in the app, decide what (if anything)
 * to say. The main signal is productivity, not the camera.
 */

export interface Signals {
  /** A face is in view. */
  face: boolean;
  /** Head turned left/right, in degrees (absolute). */
  yaw: number;
  /** Eyes mostly closed in this frame. */
  eyesClosed: boolean;
  /** Mouth wide open (yawn). */
  yawn: boolean;
  /** A phone is visible. */
  phone: boolean;
}

export type Sensitivity = "relaxed" | "normal" | "strict";

export type FocusEvent = "away" | "autoPause" | "back" | "lookAway" | "tired" | "phone";

export interface RuleState {
  samples: { t: number; s: Signals }[];
  /** When the face was last seen (ms). */
  lastFace: number;
  awaySince: number | null;
  autoPaused: boolean;
  lookingSince: number | null;
  /** Time of the last check-in (phone, look-away, tired), for the 10-minute rule. */
  lastCheckIn: number;
  /** Raised by "That was wrong": makes everything less sensitive. */
  tolerance: number;
}

export function initialRuleState(now: number): RuleState {
  return { samples: [], lastFace: now, awaySince: null, autoPaused: false, lookingSince: null, lastCheckIn: -Infinity, tolerance: 1 };
}

const FACTOR: Record<Sensitivity, number> = { relaxed: 1.5, normal: 1, strict: 0.7 };
const CHECK_IN_COOLDOWN = 10 * 60 * 1000;
/** A phone check-in can come back sooner than the others: 3 minutes. */
const PHONE_COOLDOWN = 3 * 60 * 1000;
/** How long a phone must be in view (within the last minute) before we check in. */
const PHONE_MS = 10_000;

/**
 * Adds one sample and returns the events to show. `activeRecently` = the student
 * typed, clicked, scrolled or answered something in the last ~30 s.
 */
export function step(
  st: RuleState,
  now: number,
  s: Signals,
  activeRecently: boolean,
  sensitivity: Sensitivity,
): { state: RuleState; events: FocusEvent[] } {
  const f = FACTOR[sensitivity] * st.tolerance;
  const events: FocusEvent[] = [];
  const samples = [...st.samples, { t: now, s }].filter((x) => now - x.t <= 10 * 60 * 1000);
  let { lastFace, awaySince, autoPaused, lookingSince, lastCheckIn } = st;
  const canCheckIn = now - lastCheckIn >= CHECK_IN_COOLDOWN;

  // Away from desk: no face for 60 s → "away"; 2 min → auto-pause; face again → "back".
  if (s.face) {
    if (awaySince !== null) events.push("back");
    lastFace = now;
    awaySince = null;
    autoPaused = false;
  } else {
    if (awaySince === null && now - lastFace >= 60_000 * f) {
      awaySince = now;
      events.push("away");
    }
    if (!autoPaused && now - lastFace >= 120_000 * f) {
      autoPaused = true;
      events.push("autoPause");
    }
  }

  // Looking away for 30 s while nothing happens in the app → gentle nudge.
  const lookingAway = s.face && s.yaw > 35;
  if (lookingAway && !activeRecently) lookingSince ??= now;
  else lookingSince = null;
  if (lookingSince !== null && now - lookingSince >= 30_000 * f && canCheckIn) {
    events.push("lookAway");
    lookingSince = null;
    lastCheckIn = now;
  }

  // Tired: eyes closed in a large share of the last minute, or 2+ yawns in 5 minutes.
  const lastMinute = samples.filter((x) => now - x.t <= 60_000 && x.s.face);
  const closedShare = lastMinute.length >= 8 ? lastMinute.filter((x) => x.s.eyesClosed).length / lastMinute.length : 0;
  const yawns = countRuns(samples.filter((x) => now - x.t <= 5 * 60_000).map((x) => x.s.yawn));
  if ((closedShare >= 0.35 * f || yawns >= Math.ceil(2 * f)) && canCheckIn && !events.includes("lookAway")) {
    events.push("tired");
    lastCheckIn = now;
  }

  // Phone: in view for ~10 s of the last minute (relaxed 15 s, strict 7 s) → a friendly check-in.
  const phoneMs = timeWith(samples.filter((x) => now - x.t <= 60_000), (x) => x.phone);
  if (phoneMs >= PHONE_MS * f && now - lastCheckIn >= PHONE_COOLDOWN && !events.some((e) => e === "lookAway" || e === "tired")) {
    events.push("phone");
    lastCheckIn = now;
  }

  return { state: { samples, lastFace, awaySince, autoPaused, lookingSince, lastCheckIn, tolerance: st.tolerance }, events };
}

/** "That was wrong": 25% less sensitive each time, up to double. */
export function wasWrong(st: RuleState, now: number): RuleState {
  return { ...st, tolerance: Math.min(2, st.tolerance * 1.25), lastCheckIn: now, lookingSince: null };
}

/** Milliseconds during which `pred` held, assuming each sample lasts until the next. */
function timeWith(samples: { t: number; s: Signals }[], pred: (s: Signals) => boolean): number {
  let ms = 0;
  for (let i = 0; i < samples.length - 1; i++) if (pred(samples[i].s)) ms += Math.min(samples[i + 1].t - samples[i].t, 10_000);
  return ms;
}

/** Number of separate stretches of `true` (one yawn spans several frames). */
function countRuns(list: boolean[]): number {
  let runs = 0;
  for (let i = 0; i < list.length; i++) if (list[i] && !list[i - 1]) runs++;
  return runs;
}
