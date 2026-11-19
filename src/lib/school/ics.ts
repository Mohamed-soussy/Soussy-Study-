/**
 * A small, dependency-free reader for .ics calendar feeds (section 10.1, Level 1):
 * school timetables, Outlook/Google "publish calendar" links, ManageBac and Toddle feeds.
 * Handles all-day and timed events, time zones, and weekly/daily repeats.
 */

export interface IcsEvent {
  uid: string;
  summary: string;
  description: string;
  location: string;
  /** ISO. For all-day events, local midnight of that day. */
  start: string;
  end: string | null;
  allDay: boolean;
  /** Days between repeats (1 daily, 7 weekly, 14 fortnightly), if it repeats. */
  repeatEveryDays: number | null;
  repeatUntil: string | null; // YYYY-MM-DD
  url: string;
}

function unfold(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

const unescape = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

/** The UTC offset (minutes) of a time zone at a given moment, from the browser/Node's own tz data. */
function offsetMinutes(tz: string, utc: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(utc);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return Math.round((asUtc - utc.getTime()) / 60000);
  } catch {
    return 0; // unknown zone name: treat as UTC
  }
}

/** Windows zone names some school systems still use. */
const WINDOWS_TZ: Record<string, string> = {
  "Arab Standard Time": "Asia/Riyadh",
  "Arabian Standard Time": "Asia/Dubai",
  "GMT Standard Time": "Europe/London",
  "Eastern Standard Time": "America/New_York",
  "Pacific Standard Time": "America/Los_Angeles",
  "Central Standard Time": "America/Chicago",
  "W. Europe Standard Time": "Europe/Berlin",
  "Egypt Standard Time": "Africa/Cairo",
  UTC: "UTC",
};

/** DTSTART/DTEND value → Date. */
export function icsDate(value: string, params: Record<string, string>): { date: Date; allDay: boolean } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h || params.VALUE === "DATE") return { date: new Date(Number(y), Number(mo) - 1, Number(d)), allDay: true };
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  if (z) return { date: new Date(wall), allDay: false };
  const tzid = params.TZID?.replace(/^"|"$/g, "");
  if (!tzid) return { date: new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0)), allDay: false };
  const tz = WINDOWS_TZ[tzid] ?? tzid;
  // Two passes handle the hour around a daylight-saving change.
  let guess = wall - offsetMinutes(tz, new Date(wall)) * 60000;
  guess = wall - offsetMinutes(tz, new Date(guess)) * 60000;
  return { date: new Date(guess), allDay: false };
}

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function parseIcs(text: string): { name: string; events: IcsEvent[] } {
  const lines = unfold(text);
  let name = "";
  const events: IcsEvent[] = [];
  let cur: Record<string, { value: string; params: Record<string, string> }> | null = null;
  let depth = 0; // skip VALARM etc. inside VEVENT

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      depth = 0;
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) events.push(...toEvents(cur));
      cur = null;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const [rawName, ...rawParams] = line.slice(0, colon).split(";");
    const value = line.slice(colon + 1);
    if (!cur) {
      if (rawName === "X-WR-CALNAME") name = unescape(value);
      continue;
    }
    if (rawName === "BEGIN") depth++;
    else if (rawName === "END") depth--;
    else if (depth === 0) {
      const params: Record<string, string> = {};
      for (const p of rawParams) {
        const [k, v] = p.split("=");
        if (k && v !== undefined) params[k.toUpperCase()] = v;
      }
      cur[rawName.toUpperCase()] ??= { value, params };
    }
  }
  return { name, events };
}

function toEvents(p: Record<string, { value: string; params: Record<string, string> }>): IcsEvent[] {
  if (p.STATUS?.value === "CANCELLED") return [];
  const start = p.DTSTART && icsDate(p.DTSTART.value, p.DTSTART.params);
  if (!start) return [];
  let end = p.DTEND ? icsDate(p.DTEND.value, p.DTEND.params)?.date ?? null : null;
  if (!end && p.DURATION) {
    const d = p.DURATION.value.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
    if (d) end = new Date(start.date.getTime() + ((Number(d[1] ?? 0) * 24 + Number(d[2] ?? 0)) * 60 + Number(d[3] ?? 0)) * 60000);
  }
  // All-day events end the next day in .ics; we store them as one day.
  if (start.allDay && end && end.getTime() - start.date.getTime() <= 864e5) end = null;
  const base: IcsEvent = {
    uid: unescape(p.UID?.value ?? `${p.SUMMARY?.value}-${p.DTSTART.value}`),
    summary: unescape(p.SUMMARY?.value ?? "").slice(0, 200) || "(untitled)",
    description: unescape(p.DESCRIPTION?.value ?? "").slice(0, 2000),
    location: unescape(p.LOCATION?.value ?? "").slice(0, 200),
    start: start.date.toISOString(),
    end: end ? end.toISOString() : null,
    allDay: start.allDay,
    repeatEveryDays: null,
    repeatUntil: null,
    url: unescape(p.URL?.value ?? ""),
  };
  if (!p.RRULE) return [base];

  const rule = Object.fromEntries(p.RRULE.value.split(";").map((kv) => kv.split("=") as [string, string]));
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  let until: Date | null = rule.UNTIL ? icsDate(rule.UNTIL, {})?.date ?? null : null;
  if (rule.FREQ === "DAILY") {
    if (rule.COUNT) until = new Date(start.date.getTime() + (Number(rule.COUNT) - 1) * interval * 864e5);
    return [{ ...base, repeatEveryDays: interval, repeatUntil: until ? ymd(until) : null }];
  }
  if (rule.FREQ === "WEEKLY") {
    const days = (rule.BYDAY ?? DAYS[start.date.getDay()]).split(",").map((d: string) => DAYS.indexOf(d.slice(-2))).filter((d: number) => d >= 0);
    if (rule.COUNT) until = new Date(start.date.getTime() + Math.ceil(Number(rule.COUNT) / days.length) * interval * 7 * 864e5);
    // "Every Sunday and Tuesday" becomes one weekly item per day.
    return days.map((day: number) => {
      const shift = (day - start.date.getDay() + 7) % 7;
      const s = new Date(start.date.getTime() + shift * 864e5);
      return {
        ...base,
        uid: days.length > 1 ? `${base.uid}#${DAYS[day]}` : base.uid,
        start: s.toISOString(),
        end: end ? new Date(end.getTime() + shift * 864e5).toISOString() : null,
        repeatEveryDays: 7 * interval,
        repeatUntil: until ? ymd(until) : null,
      };
    });
  }
  // Monthly/yearly repeats are rare in school feeds: keep the first one.
  return [base];
}
