"use client";

import type Konva from "konva";
import { Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Caveat } from "next/font/google";
import { Layer, Line, Rect, Stage, Text } from "react-konva";
import { Button } from "@/components/ui/button";
import { BOARD_H, BOARD_W, words, type BoardAction, type BoardColor, type Lesson } from "@/lib/whiteboard/types";
import { cn } from "@/lib/utils";
import { bestVoice, saveVoice, voicesFor } from "@/lib/voice";

/**
 * The AI whiteboard player (section 7). Speech comes from the browser's own
 * Web Speech API (free). Each drawing appears when the narration reaches its
 * word: we listen to the speech engine's word "boundary" events, and fall back
 * to a timed estimate on voices that don't send them.
 */

const FONT_SIZE = { small: 16, medium: 22, large: 34 } as const;

interface Palette {
  board: string;
  grid: string;
  colors: Record<BoardColor, string>;
  font: string;
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, d: string) => css.getPropertyValue(name).trim() || d;
  return {
    board: v("--surface", "#ffffff"),
    grid: v("--surface-2", "#f1f5f9"),
    font: getComputedStyle(document.body).fontFamily || "sans-serif",
    colors: {
      ink: v("--text", "#0f172a"),
      primary: v("--primary", "#4f46e5"),
      danger: v("--danger", "#ef4444"),
      success: v("--success", "#10b981"),
      warning: v("--warning", "#f59e0b"),
      violet: v("--submission", "#8b5cf6"),
      teal: v("--event", "#14b8a6"),
    },
  };
}

/** A drawn shape plus where it is, so a student can point at it. */
export interface PickedShape {
  kind: string;
  label?: string;
  text?: string;
}

function bbox(a: BoardAction): { x: number; y: number; w: number; h: number } {
  switch (a.kind) {
    case "line":
    case "arrow": {
      const x2 = a.x2 ?? a.x;
      const y2 = a.y2 ?? a.y;
      return { x: Math.min(a.x, x2), y: Math.min(a.y, y2), w: Math.abs(x2 - a.x), h: Math.abs(y2 - a.y) };
    }
    case "circle":
      return { x: a.x - (a.r ?? 40), y: a.y - (a.r ?? 40), w: (a.r ?? 40) * 2, h: (a.r ?? 40) * 2 };
    case "curve": {
      const p = a.points ?? [a.x, a.y];
      const xs = p.filter((_, i) => i % 2 === 0);
      const ys = p.filter((_, i) => i % 2 === 1);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    case "text": {
      const fs = FONT_SIZE[a.size ?? "medium"];
      return { x: a.x, y: a.y, w: Math.max(20, (a.text ?? "").length * fs * 0.52), h: fs * 1.2 };
    }
    default:
      return { x: a.x, y: a.y, w: a.w ?? 120, h: a.h ?? 80 };
  }
}

/* ---------- hand-drawn look: wobbly strokes drawn like a pen, handwriting text ---------- */

const hand = Caveat({ subsets: ["latin"], weight: ["600", "700"] });

/** Tiny deterministic random numbers, so a shape wobbles the same way every time. */
function rng(seed: number) {
  let x = Math.abs(Math.floor(seed * 9301 + 49297)) % 233280 || 1;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

/** A straight pen stroke from A to B with a slight natural wobble. */
function wobbly(x1: number, y1: number, x2: number, y2: number, r: () => number): number[] {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(2, Math.round(len / 18));
  const nx = -(y2 - y1) / (len || 1);
  const ny = (x2 - x1) / (len || 1);
  const bow = (r() - 0.5) * Math.min(6, len * 0.03);
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const j = (r() - 0.5) * 1.4 + Math.sin(t * Math.PI) * bow;
    out.push(x1 + (x2 - x1) * t + nx * j, y1 + (y2 - y1) * t + ny * j);
  }
  return out;
}

/** The strokes a teacher would draw for this shape, in order. */
function strokes(a: BoardAction): number[][] {
  const r = rng(a.x * 7 + a.y * 13 + (a.w ?? 0) + (a.r ?? 0));
  const o = () => (r() - 0.5) * 6; // ends overshoot a little, like a real pen
  switch (a.kind) {
    case "line":
      return [wobbly(a.x, a.y, a.x2 ?? a.x, a.y2 ?? a.y, r)];
    case "arrow": {
      const x2 = a.x2 ?? a.x;
      const y2 = a.y2 ?? a.y;
      const ang = Math.atan2(y2 - a.y, x2 - a.x);
      const h = 16;
      return [
        wobbly(a.x, a.y, x2, y2, r),
        wobbly(x2, y2, x2 - h * Math.cos(ang - 0.45), y2 - h * Math.sin(ang - 0.45), r),
        wobbly(x2, y2, x2 - h * Math.cos(ang + 0.45), y2 - h * Math.sin(ang + 0.45), r),
      ];
    }
    case "rect": {
      const w = a.w ?? 120;
      const h = a.h ?? 80;
      return [
        wobbly(a.x + o(), a.y, a.x + w + o(), a.y, r),
        wobbly(a.x + w, a.y + o(), a.x + w, a.y + h + o(), r),
        wobbly(a.x + w + o(), a.y + h, a.x + o(), a.y + h, r),
        wobbly(a.x, a.y + h + o(), a.x, a.y + o(), r),
      ];
    }
    case "circle": {
      const rad = a.r ?? 40;
      const start = r() * Math.PI * 2;
      const turns = 1.06 + r() * 0.06;
      const n = Math.max(24, Math.round(rad / 3));
      const pts: number[] = [];
      for (let i = 0; i <= n * turns; i++) {
        const t = start + (i / n) * Math.PI * 2;
        const rr = rad * (1 + (r() - 0.5) * 0.04 + (i / n) * 0.03);
        pts.push(a.x + Math.cos(t) * rr, a.y + Math.sin(t) * rr);
      }
      return [pts];
    }
    case "curve":
      return [a.points ?? [a.x, a.y]];
    case "highlight": {
      // A marker scribble back and forth across the area.
      const w = a.w ?? 160;
      const h = a.h ?? 50;
      const rows = Math.max(2, Math.round(h / 14));
      const pts: number[] = [];
      for (let i = 0; i <= rows; i++) {
        const y = a.y + (i / rows) * h;
        pts.push(i % 2 ? a.x + w : a.x, y + (r() - 0.5) * 3);
      }
      return [pts];
    }
    default:
      return [];
  }
}

const lengthOf = (pts: number[]) => {
  let l = 0;
  for (let i = 2; i < pts.length; i += 2) l += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return l;
};

/** The first `len` units of a polyline, and where the pen tip is. */
function partial(pts: number[], len: number): { pts: number[]; tip: [number, number] } {
  const out = [pts[0], pts[1]];
  let left = len;
  for (let i = 2; i < pts.length; i += 2) {
    const seg = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    if (seg >= left) {
      const t = seg ? left / seg : 1;
      const x = pts[i - 2] + (pts[i] - pts[i - 2]) * t;
      const y = pts[i - 1] + (pts[i + 1] - pts[i - 1]) * t;
      out.push(x, y);
      return { pts: out, tip: [x, y] };
    }
    out.push(pts[i], pts[i + 1]);
    left -= seg;
  }
  return { pts: out, tip: [pts[pts.length - 2], pts[pts.length - 1]] };
}

/** One shape, drawn live like a pen on a whiteboard the first time it appears. */
function Shape({ a, p, onPick, selected, onTip }: { a: BoardAction; p: Palette; onPick: () => void; selected: boolean; onTip?: (tip: [number, number] | null) => void }) {
  const color = p.colors[a.color ?? "ink"];
  const sw = a.kind === "highlight" ? 14 : selected ? 5 : 3.2;
  const paths = useMemo(() => strokes(a), [a]);
  const total = useMemo(() => paths.reduce((n, s) => n + lengthOf(s), 0), [paths]);
  const chars = (a.text ?? "").length;
  // Pen speed: ~700 board units a second; handwriting ~28 letters a second.
  const duration = a.kind === "text" ? Math.min(2600, 250 + chars * 36) : Math.min(1800, Math.max(350, (total / 700) * 1000));
  const [progress, setProgress] = useState(() => (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 0));

  useEffect(() => {
    if (progress >= 1) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      setProgress(k);
      if (k < 1) raf = requestAnimationFrame(tick);
      else onTip?.(null);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      onTip?.(null);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tipRef = useRef<[number, number] | null>(null);
  useEffect(() => {
    if (progress < 1 && tipRef.current) onTip?.(tipRef.current);
  }, [progress]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = { onClick: onPick, onTap: onPick };
  const glow = { shadowColor: selected ? p.colors.danger : undefined, shadowBlur: selected ? 12 : 0, shadowOpacity: selected ? 0.9 : 0 };

  if (a.kind === "text") {
    const fs = FONT_SIZE[a.size ?? "medium"] * 1.25;
    const shown = (a.text ?? "").slice(0, Math.ceil(chars * progress));
    const arabic = /[\u0600-\u06FF]/.test(a.text ?? "");
    tipRef.current = [a.x + Math.min(BOARD_W - a.x - 20, shown.length * fs * 0.42), a.y + fs * 0.6];
    return (
      <Text
        {...pick}
        {...glow}
        x={a.x}
        y={a.y}
        text={shown}
        fontSize={fs}
        fontStyle={a.size === "large" ? "bold" : "normal"}
        fontFamily={arabic ? p.font : `${hand.style.fontFamily}, ${p.font}`}
        fill={color}
        width={Math.min(BOARD_W - a.x - 20, 640)}
        wrap="word"
        hitStrokeWidth={18}
      />
    );
  }

  // Draw the strokes one after another up to the current progress.
  let left = total * progress;
  const drawn: number[][] = [];
  let tip: [number, number] | null = null;
  for (const s of paths) {
    if (left <= 0) break;
    const l = lengthOf(s);
    if (left >= l) drawn.push(s);
    else {
      const part = partial(s, left);
      drawn.push(part.pts);
      tip = part.tip;
    }
    left -= l;
  }
  tipRef.current = tip;
  return (
    <>
      {drawn.map((pts, i) => (
        <Line
          key={i}
          {...pick}
          {...glow}
          points={pts}
          stroke={a.kind === "highlight" ? p.colors.warning : color}
          opacity={a.kind === "highlight" ? 0.3 : 1}
          strokeWidth={sw}
          lineCap="round"
          lineJoin="round"
          tension={a.kind === "curve" ? 0.4 : 0}
          dash={a.dashed ? [10, 8] : undefined}
          hitStrokeWidth={18}
        />
      ))}
    </>
  );
}

export interface PlayerHandle {
  pause: () => void;
}

export function WhiteboardPlayer({
  lesson,
  onPausedChange,
  onPick,
  picked,
  autoPlay,
  voice,
  startMuted,
}: {
  lesson: Lesson;
  onPausedChange?: (paused: boolean, segment: number) => void;
  onPick?: (shape: PickedShape | null) => void;
  picked?: PickedShape | null;
  autoPlay?: boolean;
  /** The chosen teacher's voice (section 6A.2). */
  voice?: { pitch: number; rate: number };
  /** Start in captions-only mode (another linked device plays the audio). */
  startMuted?: boolean;
}) {
  const t = useTranslations("whiteboard");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [seg, setSeg] = useState(0);
  const [word, setWord] = useState(-1);
  /** Highest word reached per segment, so shapes stay after pausing or replaying. */
  const [reached, setReached] = useState<number[]>(() => lesson.segments.map(() => -1));
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(Boolean(startMuted));
  const [rate, setRate] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [lasso, setLasso] = useState<number[] | null>(null);
  const [voiceBlocked, setVoiceBlocked] = useState(false);
  /** The voice has worked at least once on this page (so slow starts are just slow, not blocked). */
  const speechWorked = useRef(false);
  /** The caption timer is leading because the voice hadn't started yet. */
  const voiceTimer = useRef(false);
  // Where the pen is right now (shown as ✏️ while a shape is being drawn).
  const [pen, setPen] = useState<[number, number] | null>(null);
  const [, setFontReady] = useState(false);
  useEffect(() => {
    document.fonts?.load(`700 30px ${hand.style.fontFamily}`).then(() => setFontReady(true)).catch(() => {});
  }, []);
  // Natural device voices the student can choose from (remembered per language).
  const vlang = lesson.language === "ar" ? "ar" : "en";
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState("");
  useEffect(() => {
    const load = () => {
      setVoices(voicesFor(vlang));
      setVoiceName(bestVoice(vlang)?.name ?? "");
    };
    load();
    window.speechSynthesis?.addEventListener?.("voiceschanged", load);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", load);
  }, [vlang]);
  const timers = useRef<number[]>([]);
  const playingRef = useRef(false);
  const segRef = useRef(0);

  useEffect(() => {
    setPalette(readPalette());
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onTheme = () => setPalette(readPalette());
    mq.addEventListener("change", onTheme);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", onTheme);
    };
  }, []);

  const clearTimers = () => {
    timers.current.forEach((id) => clearTimeout(id));
    timers.current = [];
  };

  const reach = useCallback((s: number, w: number) => {
    setWord(w);
    setReached((r) => (r[s] >= w ? r : r.map((v, i) => (i === s ? w : v))));
  }, []);

  const stop = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    clearTimers();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  const playSegment = useCallback(
    (i: number) => {
      clearTimers();
      window.speechSynthesis?.cancel();
      if (i >= lesson.segments.length) {
        stop();
        onPausedChange?.(true, lesson.segments.length - 1);
        return;
      }
      segRef.current = i;
      setSeg(i);
      reach(i, 0);
      const say = lesson.segments[i].say;
      const list = words(say);
      // Character offset where each word starts, to turn boundary events into word numbers.
      const starts: number[] = [];
      let pos = 0;
      for (const w of list) {
        pos = say.indexOf(w, pos);
        starts.push(pos);
        pos += w.length;
      }
      const wordAt = (charIndex: number) => {
        let k = 0;
        while (k + 1 < starts.length && starts[k + 1] <= charIndex) k++;
        return k;
      };
      let advanced = false;
      const next = () => {
        if (advanced) return; // the voice ending and the caption timer can both arrive
        advanced = true;
        reach(i, list.length);
        if (playingRef.current) timers.current.push(window.setTimeout(() => playSegment(i + 1), 450));
      };
      // ~165 words per minute at rate 1 (Arabic voices are a little slower).
      const msPerWord = (lesson.language === "ar" ? 430 : 365) / rate;
      const estimate = (fromWord: number) => {
        for (let k = fromWord; k < list.length; k++) timers.current.push(window.setTimeout(() => reach(i, k), (k - fromWord) * msPerWord));
      };

      const synth = window.speechSynthesis;
      if (muted || !synth) {
        estimate(0);
        timers.current.push(window.setTimeout(next, list.length * msPerWord + 300));
        return;
      }
      const u = new SpeechSynthesisUtterance(say);
      const lang = lesson.language === "ar" ? "ar" : "en";
      u.lang = lang === "ar" ? "ar-SA" : "en-US";
      const deviceVoice = bestVoice(lang);
      if (deviceVoice) u.voice = deviceVoice;
      u.rate = 0.95 * rate * (voice?.rate ?? 1);
      u.pitch = voice?.pitch ?? 1;
      let gotBoundary = false;
      let started = false;
      const boundary = (e: SpeechSynthesisEvent) => {
        if (e.name && e.name !== "word") return;
        if (!gotBoundary) clearTimers(); // real word timing arrived: drop the estimate
        gotBoundary = true;
        reach(i, wordAt(e.charIndex));
      };
      u.onboundary = boundary;
      u.onstart = () => {
        // The voice started (maybe late): let it lead again and drop the caption timer.
        if (!started && voiceTimer.current) clearTimers();
        started = true;
        voiceTimer.current = false;
        speechWorked.current = true;
        // Some voices never send word boundaries; estimate if none arrive quickly.
        timers.current.push(window.setTimeout(() => !gotBoundary && estimate(1), 600));
      };
      u.onend = next;
      u.onerror = (e) => {
        if (e.error === "interrupted" || e.error === "canceled") return;
        estimate(0);
        timers.current.push(window.setTimeout(next, list.length * msPerWord));
      };
      // Chrome drops a speak() that comes right after cancel(), and can get stuck "paused": wait a beat.
      timers.current.push(
        window.setTimeout(() => {
          synth.resume();
          synth.speak(u);
        }, 80),
      );
      // Watchdog: if the voice hasn't started after a few seconds (blocked by the browser),
      // keep drawing with captions. We never cancel the voice: natural online voices can be slow
      // to start, and if it starts late it simply takes over again.
      timers.current.push(
        window.setTimeout(
          () => {
            if (started) return;
            voiceTimer.current = true;
            if (!speechWorked.current) setVoiceBlocked(true);
            estimate(0);
            timers.current.push(window.setTimeout(next, list.length * msPerWord + 300));
          },
          speechWorked.current ? 6000 : 3500,
        ),
      );
    },
    [lesson, muted, rate, reach, stop, onPausedChange, voice],
  );

  const play = useCallback(() => {
    setVoiceBlocked(false);
    playingRef.current = true;
    setPlaying(true);
    setSelectedKey(null);
    onPick?.(null);
    onPausedChange?.(false, segRef.current);
    playSegment(segRef.current >= lesson.segments.length ? 0 : segRef.current);
  }, [playSegment, lesson.segments.length, onPick, onPausedChange]);

  const pause = useCallback(() => {
    stop();
    onPausedChange?.(true, segRef.current);
  }, [stop, onPausedChange]);

  // New lesson: reset and optionally start.
  useEffect(() => {
    stop();
    segRef.current = 0;
    setSeg(0);
    setWord(-1);
    setReached(lesson.segments.map(() => -1));
    if (autoPlay) {
      const id = window.setTimeout(() => play(), 50);
      return () => clearTimeout(id);
    }
  }, [lesson]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stop(), [stop]);

  // Long lessons have several boards: show only the board the current step is on.
  const boardStart = useMemo(() => {
    let start = 0;
    for (let i = 0; i <= seg && i < lesson.segments.length; i++) if (lesson.segments[i].newBoard) start = i;
    return start;
  }, [lesson, seg]);
  const boardEnd = useMemo(() => {
    let end = lesson.segments.length;
    for (let i = boardStart + 1; i < lesson.segments.length; i++)
      if (lesson.segments[i].newBoard) {
        end = i;
        break;
      }
    return end;
  }, [lesson, boardStart]);
  const boards = useMemo(() => 1 + lesson.segments.filter((s, i) => i > 0 && s.newBoard).length, [lesson]);
  const boardNo = useMemo(() => 1 + lesson.segments.slice(1, boardStart + 1).filter((s) => s.newBoard).length, [lesson, boardStart]);

  const visible = useMemo(() => {
    const out: { key: string; a: BoardAction }[] = [];
    lesson.segments.forEach((s, si) => {
      if (si < boardStart || si >= boardEnd) return;
      s.actions.forEach((a, ai) => {
        if (a.word <= reached[si]) out.push({ key: `${si}-${ai}`, a });
      });
    });
    return out;
  }, [lesson, reached, boardStart, boardEnd]);

  function pick(key: string, a: BoardAction) {
    if (playingRef.current) pause();
    setSelectedKey(key);
    onPick?.({ kind: a.kind, label: a.label, text: a.text });
  }

  // Circling: drag a loop while paused; the shape whose center is inside it is picked.
  const scale = width / BOARD_W;
  const toBoard = (stage: Konva.Stage) => {
    const pt = stage.getPointerPosition();
    return pt ? { x: pt.x / scale, y: pt.y / scale } : null;
  };
  function finishLasso(points: number[]) {
    if (points.length < 8) return;
    const xs = points.filter((_, i) => i % 2 === 0);
    const ys = points.filter((_, i) => i % 2 === 1);
    const box = { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) };
    const cx = (box.x1 + box.x2) / 2;
    const cy = (box.y1 + box.y2) / 2;
    let best: { key: string; a: BoardAction; d: number } | null = null;
    for (const v of visible) {
      const b = bbox(v.a);
      const mx = b.x + b.w / 2;
      const my = b.y + b.h / 2;
      const inside = mx >= box.x1 && mx <= box.x2 && my >= box.y1 && my <= box.y2;
      const d = Math.hypot(mx - cx, my - cy) + (inside ? 0 : 10000);
      if (!best || d < best.d) best = { ...v, d };
    }
    if (best && best.d < 10000) pick(best.key, best.a);
  }

  const current = lesson.segments[seg];
  const list = current ? words(current.say) : [];

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={wrapRef}
        className={cn("relative w-full overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-sm", !playing && "cursor-crosshair")}
        style={{ aspectRatio: `${BOARD_W} / ${BOARD_H}` }}
        data-testid="whiteboard"
      >
        {palette && (
          <Stage
            width={width}
            height={width * (BOARD_H / BOARD_W)}
            scaleX={scale}
            scaleY={scale}
            onMouseDown={(e) => {
              if (playing || e.target !== e.target.getStage()) return;
              const pt = toBoard(e.target.getStage()!);
              if (pt) setLasso([pt.x, pt.y]);
            }}
            onTouchStart={(e) => {
              if (playing || e.target !== e.target.getStage()) return;
              const pt = toBoard(e.target.getStage()!);
              if (pt) setLasso([pt.x, pt.y]);
            }}
            onMouseMove={(e) => {
              if (!lasso) return;
              const pt = toBoard(e.target.getStage()!);
              if (pt) setLasso((l) => (l ? [...l, pt.x, pt.y] : l));
            }}
            onTouchMove={(e) => {
              if (!lasso) return;
              const pt = toBoard(e.target.getStage()!);
              if (pt) setLasso((l) => (l ? [...l, pt.x, pt.y] : l));
            }}
            onMouseUp={() => {
              if (lasso) finishLasso(lasso);
              setLasso(null);
            }}
            onTouchEnd={() => {
              if (lasso) finishLasso(lasso);
              setLasso(null);
            }}
          >
            <Layer listening={false}>
              <Rect x={0} y={0} width={BOARD_W} height={BOARD_H} fill={palette.board} />
              {Array.from({ length: 19 }, (_, i) => (
                <Line key={`v${i}`} points={[(i + 1) * 50, 0, (i + 1) * 50, BOARD_H]} stroke={palette.grid} strokeWidth={1} />
              ))}
              {Array.from({ length: 12 }, (_, i) => (
                <Line key={`h${i}`} points={[0, (i + 1) * 50, BOARD_W, (i + 1) * 50]} stroke={palette.grid} strokeWidth={1} />
              ))}
            </Layer>
            <Layer>
              {visible.map(({ key, a }) => (
                <Shape key={key} a={a} p={palette} selected={selectedKey === key && !!picked} onPick={() => pick(key, a)} onTip={setPen} />
              ))}
              {pen && <Text x={pen[0] - 4} y={pen[1] - 30} text="✏️" fontSize={30} listening={false} />}
              {lasso && <Line points={lasso} stroke={palette.colors.danger} strokeWidth={3} dash={[8, 6]} lineCap="round" tension={0.3} listening={false} />}
            </Layer>
          </Stage>
        )}
      </div>

      {voiceBlocked && !muted && (
        <p className="rounded-[10px] bg-warning/15 px-3 py-2 text-sm text-text" role="status">
          {t("voiceBlocked")}
        </p>
      )}
      {/* Captions: the sentence being spoken, current word highlighted. */}
      <p className="min-h-[3.2em] rounded-[10px] bg-surface-2/70 px-4 py-2 text-[15px] leading-7" dir="auto" aria-live="polite" data-testid="caption">
        {list.map((w, i) => (
          <span key={i} className={cn(i === word && playing ? "rounded bg-primary-soft text-primary" : i <= word ? "text-text" : "text-muted")}>
            {w}{" "}
          </span>
        ))}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => { stop(); playSegment(Math.max(0, seg - 1)); playingRef.current = true; setPlaying(true); }} aria-label={t("prevStep")}>
          <SkipBack className="rtl:rotate-180" />
        </Button>
        {playing ? (
          <Button onClick={pause} aria-label={t("pause")}>
            <Pause aria-hidden />
            {t("pause")}
          </Button>
        ) : (
          <Button onClick={play} aria-label={t("play")}>
            <Play className="rtl:rotate-180" aria-hidden />
            {seg === 0 && word < 0 ? t("play") : t("resume")}
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => { stop(); playSegment(Math.min(lesson.segments.length - 1, seg + 1)); playingRef.current = true; setPlaying(true); }} aria-label={t("nextStep")}>
          <SkipForward className="rtl:rotate-180" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            stop();
            setReached(lesson.segments.map(() => -1));
            segRef.current = 0;
            setSeg(0);
            setWord(-1);
          }}
          aria-label={t("restart")}
        >
          <RotateCcw />
        </Button>
        <div className="flex items-center gap-1" role="group" aria-label={t("steps")}>
          {lesson.segments.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                stop();
                segRef.current = i;
                setSeg(i);
                setReached((r) => r.map((v, k) => (k < i ? Math.max(v, 999) : v)));
              }}
              className={cn("size-2.5 rounded-full", i === seg ? "bg-primary" : reached[i] >= 0 ? "bg-primary/40" : "bg-border")}
              aria-label={t("step", { n: i + 1 })}
            />
          ))}
        </div>
        {boards > 1 && <span className="text-xs font-medium text-muted">{t("board", { n: boardNo, total: boards })}</span>}
        <div className="ms-auto flex flex-wrap items-center gap-1">
          {voices.length > 1 && (
            <select
              aria-label={t("voice")}
              value={voiceName}
              onChange={(e) => {
                saveVoice(vlang, e.target.value);
                setVoiceName(e.target.value);
              }}
              className="h-9 max-w-40 rounded-[8px] border border-border bg-surface px-2 text-sm"
            >
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name.replace(/^(Microsoft|Google)\s+/, "").replace(/\s*\(.*\)$/, "").replace(/ Online$/, "")}
                </option>
              ))}
            </select>
          )}
          <Button variant="ghost" size="icon" onClick={() => setMuted((m) => !m)} aria-label={muted ? t("unmute") : t("mute")} aria-pressed={muted}>
            {muted ? <VolumeX /> : <Volume2 />}
          </Button>
          <select
            aria-label={t("speed")}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="h-9 rounded-[8px] border border-border bg-surface px-2 text-sm"
          >
            {[0.8, 1, 1.2, 1.4].map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
