"use client";

import Konva from "konva";
import { Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Arrow, Circle, Layer, Line, Rect, Stage, Text } from "react-konva";
import { Button } from "@/components/ui/button";
import { BOARD_H, BOARD_W, words, type BoardAction, type BoardColor, type Lesson } from "@/lib/whiteboard/types";
import { cn } from "@/lib/utils";

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

/** One shape, with a quick draw-in animation (≤ 0.25 s) the first time it appears. */
function Shape({ a, p, onPick, selected }: { a: BoardAction; p: Palette; onPick: () => void; selected: boolean }) {
  const ref = useRef<Konva.Shape | null>(null);
  const color = p.colors[a.color ?? "ink"];
  const sw = a.kind === "highlight" ? 0 : selected ? 5 : 3;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let tween: Konva.Tween;
    if (a.kind === "line" || a.kind === "arrow") {
      const full = [a.x, a.y, a.x2 ?? a.x, a.y2 ?? a.y];
      (node as Konva.Line).points([a.x, a.y, a.x, a.y]);
      tween = new Konva.Tween({ node, duration: 0.25, points: full, easing: Konva.Easings.EaseOut });
    } else if (a.kind === "curve") {
      const line = node as Konva.Line;
      const len = Math.max(50, Math.hypot(bbox(a).w, bbox(a).h) * 1.6);
      line.dash([len, len]);
      line.dashOffset(len);
      tween = new Konva.Tween({
        node,
        duration: 0.25,
        dashOffset: 0,
        onFinish: () => line.dash(a.dashed ? [10, 8] : []),
      });
    } else if (a.kind === "highlight") {
      node.opacity(0);
      tween = new Konva.Tween({ node, duration: 0.25, opacity: 0.28 });
    } else {
      node.opacity(0);
      node.scale({ x: 0.85, y: 0.85 });
      tween = new Konva.Tween({ node, duration: 0.22, opacity: 1, scaleX: 1, scaleY: 1, easing: Konva.Easings.EaseOut });
    }
    tween.play();
    return () => tween.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const common = {
    ref: (n: Konva.Shape | null) => {
      ref.current = n;
    },
    onClick: onPick,
    onTap: onPick,
    hitStrokeWidth: 18,
    shadowColor: selected ? p.colors.danger : undefined,
    shadowBlur: selected ? 12 : 0,
    shadowOpacity: selected ? 0.9 : 0,
  };
  const dash = a.dashed && a.kind !== "curve" ? [10, 8] : undefined;

  switch (a.kind) {
    case "text":
      return (
        <Text
          {...common}
          x={a.x}
          y={a.y}
          text={a.text ?? ""}
          fontSize={FONT_SIZE[a.size ?? "medium"]}
          fontStyle={a.size === "large" ? "bold" : "normal"}
          fontFamily={p.font}
          fill={color}
          width={Math.min(BOARD_W - a.x - 20, 640)}
          wrap="word"
        />
      );
    case "line":
      return <Line {...common} points={[a.x, a.y, a.x2 ?? a.x, a.y2 ?? a.y]} stroke={color} strokeWidth={sw} lineCap="round" dash={dash} />;
    case "arrow":
      return <Arrow {...common} points={[a.x, a.y, a.x2 ?? a.x, a.y2 ?? a.y]} stroke={color} fill={color} strokeWidth={sw} pointerLength={14} pointerWidth={12} dash={dash} />;
    case "rect":
      return <Rect {...common} x={a.x} y={a.y} width={a.w ?? 120} height={a.h ?? 80} stroke={color} strokeWidth={sw} cornerRadius={6} dash={dash} />;
    case "circle":
      return <Circle {...common} x={a.x} y={a.y} radius={a.r ?? 40} stroke={color} strokeWidth={sw} dash={dash} />;
    case "curve":
      return <Line {...common} points={a.points ?? [a.x, a.y]} stroke={color} strokeWidth={sw} tension={0.4} lineCap="round" lineJoin="round" />;
    case "highlight":
      return <Rect {...common} x={a.x} y={a.y} width={a.w ?? 160} height={a.h ?? 50} fill={p.colors.warning} opacity={0.28} cornerRadius={8} />;
  }
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
      const next = () => {
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
      const deviceVoice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
      if (deviceVoice) u.voice = deviceVoice;
      u.rate = rate * (voice?.rate ?? 1);
      u.pitch = voice?.pitch ?? 1;
      let gotBoundary = false;
      u.onboundary = (e) => {
        if (e.name && e.name !== "word") return;
        if (!gotBoundary) clearTimers(); // real word timing arrived: drop the estimate
        gotBoundary = true;
        reach(i, wordAt(e.charIndex));
      };
      u.onstart = () => {
        // Some voices never send word boundaries; estimate if none arrive quickly.
        timers.current.push(window.setTimeout(() => !gotBoundary && estimate(1), 600));
      };
      u.onend = next;
      u.onerror = (e) => {
        if (e.error === "interrupted" || e.error === "canceled") return;
        estimate(0);
        timers.current.push(window.setTimeout(next, list.length * msPerWord));
      };
      synth.speak(u);
    },
    [lesson, muted, rate, reach, stop, onPausedChange, voice],
  );

  const play = useCallback(() => {
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

  const visible = useMemo(() => {
    const out: { key: string; a: BoardAction }[] = [];
    lesson.segments.forEach((s, si) =>
      s.actions.forEach((a, ai) => {
        if (a.word <= reached[si]) out.push({ key: `${si}-${ai}`, a });
      }),
    );
    return out;
  }, [lesson, reached]);

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
                <Shape key={key} a={a} p={palette} selected={selectedKey === key && !!picked} onPick={() => pick(key, a)} />
              ))}
              {lasso && <Line points={lasso} stroke={palette.colors.danger} strokeWidth={3} dash={[8, 6]} lineCap="round" tension={0.3} listening={false} />}
            </Layer>
          </Stage>
        )}
      </div>

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
        <div className="ms-auto flex items-center gap-1">
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
