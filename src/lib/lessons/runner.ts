"use client";

import { useSyncExternalStore } from "react";
import { getRepo } from "@/lib/data/repo";
import { getBlob, putBlob } from "@/lib/data/idb";
import type { CalendarEvent } from "@/lib/data/types";
import { applySchoolItems } from "@/lib/school/apply";
import { clock, parseClock, resolveDue } from "@/lib/school/dates";
import { findMatch, similarity, type SchoolItem } from "@/lib/school/match";
import { TASK_CUE, type AnalyzeOut, type CheckOut } from "@/prompts/lesson.v1";
import { decodeMono16k, piecesOf, RATE, toWav } from "./audio";
import { sampleSlides } from "./frames";
import { getRepo5 } from "./repo";
import { parseDocxTranscript, parseVtt } from "./transcript-files";
import { KIND_TO_TYPE, mediaKey, slideKey, type Chapter, type KeyPoint, type Lesson, type LessonItem, type Segment, type Slide } from "./types";

/**
 * The lesson analyzer pipeline (section 11.2), run in the browser so long files never
 * need uploading: read the sound → transcribe in pieces → read slides → find tasks,
 * tests and key ideas → work out real dates → cross-check the calendar → Review tray.
 * Progress is shared through a tiny store so any page can show it.
 */

export type Stage = "saving" | "reading" | "transcribing" | "slides" | "finding" | "notes" | "done" | "error";

export interface Job {
  lessonId: string;
  title: string;
  stage: Stage;
  done: number;
  total: number;
  /** Seconds left, roughly. */
  eta: number;
  error?: string;
}

/* ---------- progress store ---------- */

const jobs = new Map<string, Job>();
const listeners = new Set<() => void>();
let snapshot: Job[] = [];
function set(id: string, patch: Partial<Job>) {
  const cur = jobs.get(id);
  if (!cur) return;
  jobs.set(id, { ...cur, ...patch });
  snapshot = [...jobs.values()];
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useLessonJobs(): Job[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
export const isRunning = (id: string) => {
  const j = jobs.get(id);
  return Boolean(j && j.stage !== "done" && j.stage !== "error");
};

/* ---------- network with patience ---------- */

class StepError extends Error {}

/** POST that waits and retries when the free AI tier is busy (it often is, briefly). */
async function post<T>(url: string, body: unknown, tries = 6): Promise<T> {
  let last = "";
  for (let attempt = 0; attempt < tries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, body instanceof FormData ? { method: "POST", body } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      last = "Couldn't reach the server. Check your internet.";
      await wait(5 * (attempt + 1));
      continue;
    }
    if (res.ok) return (await res.json()) as T;
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string; retryAfter?: number };
    last = data.message ?? data.error ?? `HTTP ${res.status}`;
    if (![429, 500, 502, 503, 504].includes(res.status) || data.error === "daily_limit") throw new StepError(last);
    await wait(Math.min(60, Math.max(data.retryAfter ?? 0, 10 * (attempt + 1))));
  }
  throw new StepError(last || "The AI is busy. Try again in a few minutes.");
}
const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

/* ---------- helpers ---------- */

type Line = Segment & { speaker?: string };

/** Splits the transcript into parts of about 1,300 words for the AI to read. */
export function windows(lines: Line[], slides: Slide[], maxWords = 1300): string[] {
  const all = [
    ...lines.map((l) => ({ at: l.s, text: `[${clock(l.s)}] ${l.speaker ? `${l.speaker}: ` : ""}${l.text}` })),
    ...slides.filter((s) => s.text).map((s) => ({ at: s.at, text: `[${clock(s.at)}] (screen) ${s.text.replace(/\s*\n\s*/g, " / ")}` })),
  ].sort((a, b) => a.at - b.at);
  const out: string[] = [];
  let cur: string[] = [];
  let words = 0;
  for (const row of all) {
    const w = row.text.split(/\s+/).length;
    if (words + w > maxWords && cur.length) {
      out.push(cur.join("\n"));
      cur = [];
      words = 0;
    }
    cur.push(row.text);
    words += w;
  }
  if (cur.length) out.push(cur.join("\n"));
  return out;
}

/** Models sometimes return HTML entities ("&amp;") in plain text. */
const plain = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Finds where the quoted words really are in the transcript, so "Heard at 34:12" is exact
 * even if the AI copied the time from a neighbouring line. Returns null if not found.
 */
export function locateQuote(quote: string, lines: Line[], near: number | null): number | null {
  const q = new Set(norm(quote).split(" ").filter((w) => w.length > 1));
  if (!q.size) return null;
  let best: { at: number; score: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    // Quotes can run over two lines.
    const text = norm(`${lines[i].text} ${lines[i + 1]?.text ?? ""}`);
    const words = new Set(text.split(" "));
    const hit = [...q].filter((w) => words.has(w)).length / q.size;
    const distance = near === null ? 0 : Math.abs(lines[i].s - near) / 600; // prefer lines near the AI's time
    const score = hit - distance * 0.1;
    if (hit >= 0.6 && (!best || score > best.score)) best = { at: lines[i].s, score };
  }
  return best ? best.at : null;
}

function subjectNameOf(code: string | null, enrollments: { subjectId: string; name: string }[]) {
  return enrollments.find((e) => e.subjectId === code)?.name ?? "";
}

/** The text the summary, quiz, flashcards and "What I missed" are made from. */
export function lessonNotes(l: Pick<Lesson, "chapters" | "key_points" | "items" | "summary">, partSummaries: string[] = []): string {
  const parts = [
    partSummaries.length ? `Parts of the lesson:\n${partSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : l.summary ? `Summary:\n${l.summary}` : "",
    l.chapters.length ? `Chapters: ${l.chapters.map((c) => `[${clock(c.at)}] ${c.title}`).join("; ")}` : "",
    l.key_points.filter((k) => k.kind === "concept").length ? `Key ideas:\n${l.key_points.filter((k) => k.kind === "concept").map((k) => `- [${clock(k.at)}] ${k.text}`).join("\n")}` : "",
    l.key_points.filter((k) => k.kind === "stressed").length ? `The teacher stressed:\n${l.key_points.filter((k) => k.kind === "stressed").map((k) => `- [${clock(k.at)}] ${k.text}`).join("\n")}` : "",
    l.key_points.filter((k) => k.kind === "question").length ? `Class questions:\n${l.key_points.filter((k) => k.kind === "question").map((k) => `- [${clock(k.at)}] ${k.text}`).join("\n")}` : "",
    l.items.length ? `Tasks:\n${l.items.map((i) => `- ${i.kind}: ${i.title}${i.details ? ` (${i.details})` : ""}${i.due ? `, due ${i.due.slice(0, 10)}` : ""} [${clock(i.at)}]`).join("\n")}` : "",
  ];
  return parts.filter(Boolean).join("\n\n");
}

function notify(title: string, body: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, icon: "/icons/icon-192.png" });
  } catch {
    /* some phones only allow notifications from a service worker */
  }
}

/* ---------- the pipeline ---------- */

export interface StartOptions {
  lesson: Lesson;
  /** The recording or transcript file. Omit to re-run from the copy saved on this device. */
  file?: Blob | null;
  fileName?: string;
  enrollments: { subjectId: string; name: string }[];
  readSlides?: boolean;
  language?: "en" | "ar" | "";
}

export async function runLesson(opts: StartOptions): Promise<void> {
  const { lesson, enrollments } = opts;
  const id = lesson.id;
  if (isRunning(id)) return;
  jobs.set(id, { lessonId: id, title: lesson.title, stage: "saving", done: 0, total: 1, eta: 0 });
  set(id, {});
  const repo5 = getRepo5();
  const subject = subjectNameOf(lesson.subject_code, enrollments);
  const lessonDate = new Date(`${lesson.lesson_date}T12:00:00`);
  let transcript: Line[] = lesson.transcript ?? [];
  let slides: Slide[] = lesson.slides ?? [];
  let duration = lesson.duration_s ?? 0;

  try {
    await repo5.lessons.update(id, { status: "processing", error: null });
    const file = opts.file ?? (await getBlob(mediaKey(id)).catch(() => null));
    const name = (opts.fileName ?? lesson.media_name ?? "").toLowerCase();

    // 1. Keep the recording on this device for playback (it is never uploaded).
    if (opts.file && lesson.media_kind !== "transcript") await putBlob(mediaKey(id), opts.file).catch(() => {});

    // 2. Transcript: use a Teams transcript file as-is, else listen to the recording.
    if (!transcript.length) {
      if (!file) throw new StepError("The recording isn't on this device any more. Add it again.");
      if (lesson.media_kind === "transcript") {
        set(id, { stage: "reading" });
        transcript = name.endsWith(".docx") ? await parseDocxTranscript(file) : parseVtt(await file.text());
        if (!transcript.length) throw new StepError("Couldn't read any lines from this transcript file.");
        duration = Math.round(transcript[transcript.length - 1].e);
      } else {
        set(id, { stage: "reading", eta: 30 });
        let samples: Float32Array;
        try {
          samples = await decodeMono16k(file);
        } catch {
          throw new StepError("This browser can't read the sound in this file. Try an MP3, M4A or MP4, or the Teams transcript.");
        }
        duration = Math.round(samples.length / RATE);
        if (duration > 3 * 3600 + 60) throw new StepError("Recordings can be up to 3 hours.");
        const pieces = piecesOf(samples);
        if (!pieces.length) throw new StepError("No speech was found in this recording.");
        const hint = [subject && `${subject} class`, lesson.title].filter(Boolean).join(". ");
        const results: Line[][] = new Array(pieces.length);
        let done = 0;
        set(id, { stage: "transcribing", done: 0, total: pieces.length, eta: pieces.length * 3 + 90 });
        // Two pieces at a time: fast, and kind to the free tier's per-minute limits.
        let next = 0;
        const worker = async () => {
          while (next < pieces.length) {
            const i = next++;
            const p = pieces[i];
            const form = new FormData();
            form.append("audio", toWav(samples.subarray(p.start, p.end)), "piece.wav");
            form.append("offset", String(p.offset));
            form.append("hint", hint);
            if (opts.language) form.append("language", opts.language);
            const out = await post<{ segments: Segment[] }>("/api/lessons/transcribe", form);
            results[i] = out.segments;
            done++;
            set(id, { done, eta: (pieces.length - done) * 3 + 90 });
          }
        };
        await Promise.all([worker(), worker()]);
        transcript = results.flat().sort((a, b) => a.s - b.s);
        if (!transcript.length) throw new StepError("No speech was found in this recording.");
      }
      await repo5.lessons.update(id, { transcript, duration_s: duration });
    }

    // 3. Read the slides and whiteboard (video only, optional).
    if (opts.readSlides && file && lesson.media_kind === "video" && !slides.length) {
      set(id, { stage: "slides", done: 0, total: 1, eta: 120 });
      const frames = await sampleSlides(file, (f) => set(id, { done: Math.round(f * 50), total: 100 }));
      slides = [];
      for (let n = 0; n < frames.length; n++) {
        const f = frames[n];
        try {
          const { text } = await post<{ text: string }>("/api/lessons/slide", { image: f.image }, 3);
          if (text) {
            slides.push({ at: f.at, text });
            const blob = await (await fetch(f.image)).blob();
            await putBlob(slideKey(id, slides.length - 1), blob).catch(() => {});
          }
        } catch {
          /* a slide we couldn't read is not worth failing the lesson for */
        }
        set(id, { done: 50 + Math.round(((n + 1) / frames.length) * 50), total: 100 });
      }
      await repo5.lessons.update(id, { slides });
    }

    // 4. Find tasks, tests and key ideas, part by part.
    const parts = windows(transcript, slides);
    set(id, { stage: "finding", done: 0, total: parts.length + 1, eta: parts.length * 30 + 40 });
    const outs: AnalyzeOut[] = [];
    for (let i = 0; i < parts.length; i++) {
      outs.push(
        await post<AnalyzeOut>("/api/lessons/analyze", {
          title: lesson.title,
          subject,
          lessonDate: lesson.lesson_date,
          part: i + 1,
          parts: parts.length,
          text: parts[i],
        }),
      );
      set(id, { done: i + 1, eta: (parts.length - i - 1) * 30 + 20 });
    }

    const at = (t: string) => parseClock(t.replace(/[[\]]/g, ""));

    // 4b. A second look: lines that sound like the teacher setting work, where the first
    // pass found nothing nearby, get a focused check so a spoken task is never missed.
    const found = outs.flatMap((o) => o.items.map((i) => at(i.at) ?? -999));
    const strong = /homework|\bdue\b|deadline|submit|by next|next lesson|for (sunday|monday|tuesday|wednesday|thursday|friday|saturday)|read (section|chapter)|do questions|واجب|موعد التسليم/i;
    const cues = transcript
      .map((l, i) => ({ i, l, score: TASK_CUE.test(l.text) ? (strong.test(l.text) ? 2 : 1) : 0 }))
      .filter((c) => c.score && !found.some((f) => Math.abs(f - c.l.s) < 45));
    const picked: typeof cues = [];
    for (const c of [...cues].sort((a, b) => b.score - a.score || a.l.s - b.l.s)) {
      if (picked.length >= 20) break;
      if (!picked.some((p) => Math.abs(p.l.s - c.l.s) < 20)) picked.push(c);
    }
    picked.sort((a, b) => a.l.s - b.l.s);
    const extra: AnalyzeOut["items"] = [];
    for (let b = 0; b < picked.length; b += 10) {
      const batch = picked.slice(b, b + 10);
      const snippets = batch.map((c) =>
        transcript
          .slice(Math.max(0, c.i - 1), c.i + 2)
          .map((l) => `[${clock(l.s)}] ${l.text}`)
          .join("\n"),
      );
      try {
        const out = await post<CheckOut>("/api/lessons/check", {
          lessonDate: lesson.lesson_date,
          weekday: lessonDate.toLocaleDateString("en-US", { weekday: "long" }),
          snippets,
        });
        for (const r of out.results) if (r.is_item && r.kind && r.confidence >= 0.5) extra.push({ ...r, kind: r.kind });
      } catch {
        /* the first pass still stands */
      }
    }
    set(id, { done: parts.length + 1, eta: 20 });
    if (extra.length) outs.push({ items: extra, stressed: [], concepts: [], questions: [], chapters: [], summary: "" });

    // 5. Exact times, real dates, no doubles.
    const events: CalendarEvent[] = await getRepo().events.list().catch(() => []);
    let items: LessonItem[] = [];
    for (const o of outs) {
      for (const it of o.items) {
        if (it.confidence < 0.5 || !it.title.trim()) continue;
        const guess = at(it.at);
        const found = it.quote ? locateQuote(it.quote, transcript, guess) : null;
        const due = resolveDue(it.due_text, it.due_date, lessonDate, { subjectCode: lesson.subject_code, events });
        const item: LessonItem = {
          id: crypto.randomUUID(),
          kind: it.kind,
          title: plain(it.title).slice(0, 160),
          details: plain(it.details).slice(0, 600),
          due_text: it.due_text.trim(),
          due: due.date ? due.date.toISOString() : null,
          how: due.how,
          at: found ?? guess ?? 0,
          quote: it.quote.trim().slice(0, 300),
          confidence: Math.round(Math.min(1, it.confidence) * due.certainty * (found === null ? 0.8 : 1) * 100) / 100,
          match: "new",
          event_id: null,
        };
        // The same task heard twice (the teacher repeats homework at the end): keep one.
        const dup = items.find((x) => x.kind === item.kind && similarity(`${x.title} ${x.details}`, `${item.title} ${item.details}`) >= 0.5 && (x.due ?? "").slice(0, 10) === (item.due ?? "").slice(0, 10));
        if (dup) {
          if (item.confidence > dup.confidence) Object.assign(dup, { ...item, id: dup.id, at: Math.min(dup.at, item.at) });
          continue;
        }
        items.push(item);
      }
    }
    items = items.sort((a, b) => a.at - b.at);

    const keyPoints: KeyPoint[] = outs
      .flatMap((o) => [
        ...o.concepts.map((c) => ({ kind: "concept" as const, text: plain(c.text), at: at(c.at) ?? 0 })),
        ...o.stressed.map((c) => ({ kind: "stressed" as const, text: plain(c.text), at: at(c.at) ?? 0 })),
        ...o.questions.map((c) => ({ kind: "question" as const, text: plain(`${c.q} — ${c.a}`), at: at(c.at) ?? 0 })),
      ])
      .filter((k) => k.text.trim())
      .sort((a, b) => a.at - b.at);
    const chapters: Chapter[] = [];
    for (const c of outs.flatMap((o) => o.chapters).map((c) => ({ title: plain(c.title), at: at(c.at) ?? 0 })).sort((a, b) => a.at - b.at)) {
      const prev = chapters[chapters.length - 1];
      if (!c.title || (prev && c.at - prev.at < 120) || chapters.some((x) => norm(x.title) === norm(c.title))) continue;
      chapters.push(c);
    }
    // Long lessons: keep at most 15 chapters, spread evenly.
    while (chapters.length > 15) chapters.splice(Math.floor(chapters.length / 2), 1);
    if (chapters[0] && chapters[0].at > 0) chapters[0].at = Math.min(chapters[0].at, transcript[0]?.s ?? 0);

    // 6. Cross-check with the calendar and Teams, then into the Review tray.
    const origin = (it: LessonItem) => ({
      kind: "lesson" as const,
      label: `${lesson.title} · ${clock(it.at)}`,
      href: `/lessons/${id}?t=${Math.floor(it.at)}`,
      at: it.at,
      quote: it.quote,
    });
    const schoolItems: SchoolItem[] = items.map((it) => {
      const s: SchoolItem = {
        type: KIND_TO_TYPE[it.kind],
        title: it.title,
        subject_code: lesson.subject_code,
        due: it.due ?? new Date(lessonDate.getTime() + 864e5).toISOString(),
        all_day: true,
        description: [it.details, it.quote && `“${it.quote}” (heard at ${clock(it.at)})`].filter(Boolean).join("\n\n"),
        origin: origin(it),
        confidence: it.due ? it.confidence : Math.min(it.confidence, 0.5),
        review: true,
      };
      it.match = findMatch(s, events)?.status ?? "new";
      return s;
    });
    const applied = await applySchoolItems(schoolItems, events);
    schoolItems.forEach((s, i) => (items[i].event_id = applied.ids.get(s) ?? null));

    // 7. The one-page summary.
    set(id, { stage: "notes", done: 0, total: 1, eta: 15 });
    const notes = lessonNotes({ chapters, key_points: keyPoints, items, summary: null }, outs.map((o) => o.summary).filter(Boolean));
    let summary: string | null = null;
    try {
      summary = (await post<{ text: string }>("/api/lessons/notes", { mode: "summary", title: lesson.title, subject, lessonDate: lesson.lesson_date, notes }, 4)).text;
    } catch {
      summary = outs.map((o) => o.summary).filter(Boolean).join("\n\n");
    }

    await repo5.lessons.update(id, { status: "ready", error: null, items, key_points: keyPoints, chapters, summary, duration_s: duration || null });
    set(id, { stage: "done", done: 1, total: 1, eta: 0 });
    notify("Your lesson is ready", `${lesson.title}: ${items.length} item${items.length === 1 ? "" : "s"} found`);
  } catch (err) {
    const message = err instanceof StepError ? err.message : "Something went wrong while analyzing this lesson.";
    if (!(err instanceof StepError)) console.error(err);
    await repo5.lessons.update(id, { status: "error", error: message, ...(transcript.length ? { transcript, duration_s: duration || null } : {}) }).catch(() => {});
    set(id, { stage: "error", error: message });
  }
}
