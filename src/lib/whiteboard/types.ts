/**
 * AI whiteboard lesson format (section 7). Gemini writes it; the browser speaks
 * each segment with the free Web Speech API and draws each action when the
 * narration reaches its word.
 *
 * The board is a fixed 1000 × 625 coordinate space, scaled to the screen.
 */

export const BOARD_W = 1000;
export const BOARD_H = 625;

export const ACTION_KINDS = ["text", "line", "arrow", "rect", "circle", "curve", "highlight"] as const;
export const COLORS = ["ink", "primary", "danger", "success", "warning", "violet", "teal"] as const;
export const SIZES = ["small", "medium", "large"] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];
export type BoardColor = (typeof COLORS)[number];

export interface BoardAction {
  /** Index of the word in the segment's `say` at which this appears (0 = first word). */
  word: number;
  kind: ActionKind;
  /** Start point / top-left / center (for circles). */
  x: number;
  y: number;
  /** End point for line and arrow. */
  x2?: number;
  y2?: number;
  /** Size for rect and highlight. */
  w?: number;
  h?: number;
  /** Radius for circle. */
  r?: number;
  /** Polyline points for curve: [x1, y1, x2, y2, ...]. */
  points?: number[];
  text?: string;
  /** Short name the AI uses for this shape, e.g. "resistor", so students can ask about it. */
  label?: string;
  color?: BoardColor;
  size?: (typeof SIZES)[number];
  dashed?: boolean;
}

export interface BoardSegment {
  say: string;
  actions: BoardAction[];
}

export interface Lesson {
  title: string;
  language: "en" | "ar";
  segments: BoardSegment[];
}

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : d;
  return Math.min(hi, Math.max(lo, n));
};

/** Cleans whatever the model returned so the player can trust it. */
export function sanitizeLesson(raw: unknown, language: "en" | "ar"): Lesson {
  const r = (raw ?? {}) as { title?: unknown; segments?: unknown };
  const segments = (Array.isArray(r.segments) ? r.segments : []).slice(0, 14).map((s) => {
    const seg = (s ?? {}) as { say?: unknown; actions?: unknown };
    const say = String(seg.say ?? "").slice(0, 400).trim();
    const words = say.split(/\s+/).filter(Boolean).length;
    const actions = (Array.isArray(seg.actions) ? seg.actions : []).slice(0, 10).flatMap((a): BoardAction[] => {
      const x = (a ?? {}) as Record<string, unknown>;
      const kind = ACTION_KINDS.includes(x.kind as ActionKind) ? (x.kind as ActionKind) : null;
      if (!kind) return [];
      const pts = Array.isArray(x.points)
        ? (x.points as unknown[]).slice(0, 80).map((p, i) => clamp(p, 0, i % 2 ? 625 : 1000, 0))
        : undefined;
      return [
        {
          word: Math.round(clamp(x.word, 0, Math.max(0, words - 1), 0)),
          kind,
          x: clamp(x.x, 0, 1000, 100),
          y: clamp(x.y, 0, 625, 100),
          x2: x.x2 == null ? undefined : clamp(x.x2, 0, 1000, 200),
          y2: x.y2 == null ? undefined : clamp(x.y2, 0, 625, 200),
          w: x.w == null ? undefined : clamp(x.w, 4, 1000, 120),
          h: x.h == null ? undefined : clamp(x.h, 4, 625, 80),
          r: x.r == null ? undefined : clamp(x.r, 4, 300, 40),
          points: pts && pts.length >= 4 ? pts.slice(0, pts.length - (pts.length % 2)) : undefined,
          text: typeof x.text === "string" ? x.text.slice(0, 120) : undefined,
          label: typeof x.label === "string" ? x.label.slice(0, 60) : undefined,
          color: COLORS.includes(x.color as BoardColor) ? (x.color as BoardColor) : "ink",
          size: SIZES.includes(x.size as (typeof SIZES)[number]) ? (x.size as (typeof SIZES)[number]) : "medium",
          dashed: x.dashed === true,
        },
      ];
    });
    return { say, actions };
  });
  return {
    title: String(r.title ?? "").slice(0, 120) || "Lesson",
    language,
    segments: segments.filter((s) => s.say || s.actions.length),
  };
}

/** Cache key: lessons on the same topic, level and language are shared by every student (section 1A). */
export function lessonKey(topic: string, level: string, language: string) {
  const norm = topic
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return `${language}|${level || "general"}|${norm}`;
}

/** Splits narration into words the same way the player counts them. */
export function words(say: string) {
  return say.split(/\s+/).filter(Boolean);
}
