"use client";

import { useEffect, useRef, useState } from "react";
import { Layer, Line, Stage } from "react-konva";

const KEY = "soussy.notes.ink";
type Stroke = { points: number[]; erase: boolean };

/** Handwriting pad with pen and eraser (Konva), saved on this device. Works with fingers and styluses. */
export function DrawPad({ tool, clearKey }: { tool: "pen" | "eraser"; clearKey: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const drawing = useRef(false);
  const [ink, setInk] = useState("#0f172a");

  useEffect(() => {
    try {
      setStrokes(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
    } catch {
      /* ignore */
    }
    setInk(getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#0f172a");
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (clearKey) setStrokes([]);
  }, [clearKey]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(strokes.slice(-800)));
    } catch {
      /* ignore */
    }
  }, [strokes]);

  const h = Math.round(w * 0.7);
  return (
    <div ref={wrap} className="w-full touch-none overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      <Stage
        width={w}
        height={h}
        onPointerDown={(e) => {
          drawing.current = true;
          const p = e.target.getStage()!.getPointerPosition()!;
          setStrokes((s) => [...s, { points: [p.x / w, p.y / w], erase: tool === "eraser" }]);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const p = e.target.getStage()!.getPointerPosition()!;
          setStrokes((s) => {
            const last = s[s.length - 1];
            return [...s.slice(0, -1), { ...last, points: [...last.points, p.x / w, p.y / w] }];
          });
        }}
        onPointerUp={() => (drawing.current = false)}
        onPointerLeave={() => (drawing.current = false)}
      >
        <Layer>
          {strokes.map((s, i) => (
            <Line
              key={i}
              points={s.points.map((v) => v * w)}
              stroke={ink}
              strokeWidth={s.erase ? 24 : 3}
              lineCap="round"
              lineJoin="round"
              tension={0.4}
              globalCompositeOperation={s.erase ? "destination-out" : "source-over"}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
