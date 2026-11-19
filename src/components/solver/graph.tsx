"use client";

import { ZoomIn, ZoomOut } from "lucide-react";
import { compile } from "mathjs";
import { useMemo, useState } from "react";
import { normalize } from "@/lib/solver/verify";

/**
 * Interactive graph of y = f(x) (section 8: "Graph: when useful, an interactive graph").
 * Plain SVG from the app's color tokens, so it matches both themes. Hover to read values.
 */
export function FunctionGraph({ expression, xmin, xmax, labels }: { expression: string; xmin: number; xmax: number; labels: { zoomIn: string; zoomOut: string } }) {
  const [range, setRange] = useState<[number, number]>(() => (xmin < xmax ? [xmin, xmax] : [-10, 10]));
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const W = 640;
  const H = 360;
  const pad = 36;

  const data = useMemo(() => {
    try {
      const f = compile(normalize(expression));
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= 400; i++) {
        const x = range[0] + ((range[1] - range[0]) * i) / 400;
        const y = Number(f.evaluate({ x }));
        pts.push({ x, y: Number.isFinite(y) ? y : NaN });
      }
      const ys = pts.map((p) => p.y).filter(Number.isFinite).sort((a, b) => a - b);
      if (!ys.length) return null;
      // Ignore extreme spikes (asymptotes) when choosing the y range.
      let lo = ys[Math.floor(ys.length * 0.02)];
      let hi = ys[Math.ceil(ys.length * 0.98) - 1];
      if (lo === hi) {
        lo -= 1;
        hi += 1;
      }
      const m = (hi - lo) * 0.1;
      return { pts, f, y0: Math.min(lo - m, 0 > lo - m && 0 < hi + m ? lo - m : lo - m), y1: hi + m };
    } catch {
      return null;
    }
  }, [expression, range]);

  if (!data) return null;
  const sx = (x: number) => pad + ((x - range[0]) / (range[1] - range[0])) * (W - 2 * pad);
  const sy = (y: number) => H - pad - ((y - data.y0) / (data.y1 - data.y0)) * (H - 2 * pad);
  const path: string[] = [];
  let pen = false;
  for (const p of data.pts) {
    if (!Number.isFinite(p.y) || p.y < data.y0 - (data.y1 - data.y0) || p.y > data.y1 + (data.y1 - data.y0)) {
      pen = false;
      continue;
    }
    path.push(`${pen ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`);
    pen = true;
  }
  const ticks = (a: number, b: number) => {
    const step = 10 ** Math.floor(Math.log10((b - a) / 5));
    const nice = [1, 2, 5, 10].map((k) => k * step).find((s) => (b - a) / s <= 10) ?? step * 10;
    const out: number[] = [];
    for (let v = Math.ceil(a / nice) * nice; v <= b; v += nice) out.push(Number(v.toPrecision(10)));
    return out;
  };
  const zoom = (k: number) => {
    const c = (range[0] + range[1]) / 2;
    const half = ((range[1] - range[0]) / 2) * k;
    setRange([c - half, c + half]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-[10px] border border-border bg-surface">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full min-w-[320px]"
          role="img"
          aria-label={`y = ${expression}`}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const x = range[0] + (((e.clientX - r.left) / r.width) * W - pad) / (W - 2 * pad) * (range[1] - range[0]);
            const y = Number(data.f.evaluate({ x }));
            setHover(Number.isFinite(y) ? { x, y } : null);
          }}
          onMouseLeave={() => setHover(null)}
        >
          {ticks(range[0], range[1]).map((t) => (
            <g key={`x${t}`}>
              <line x1={sx(t)} x2={sx(t)} y1={pad} y2={H - pad} stroke="var(--surface-2)" />
              <text x={sx(t)} y={H - pad + 16} fontSize="11" textAnchor="middle" fill="var(--muted)">
                {t}
              </text>
            </g>
          ))}
          {ticks(data.y0, data.y1).map((t) => (
            <g key={`y${t}`}>
              <line x1={pad} x2={W - pad} y1={sy(t)} y2={sy(t)} stroke="var(--surface-2)" />
              <text x={pad - 6} y={sy(t) + 4} fontSize="11" textAnchor="end" fill="var(--muted)">
                {t}
              </text>
            </g>
          ))}
          {range[0] <= 0 && range[1] >= 0 && <line x1={sx(0)} x2={sx(0)} y1={pad} y2={H - pad} stroke="var(--muted)" strokeWidth="1.2" />}
          {data.y0 <= 0 && data.y1 >= 0 && <line x1={pad} x2={W - pad} y1={sy(0)} y2={sy(0)} stroke="var(--muted)" strokeWidth="1.2" />}
          <path d={path.join(" ")} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" />
          {hover && hover.y >= data.y0 && hover.y <= data.y1 && (
            <g>
              <circle cx={sx(hover.x)} cy={sy(hover.y)} r="5" fill="var(--primary)" stroke="var(--surface)" strokeWidth="2" />
              <rect x={Math.min(sx(hover.x) + 8, W - 150)} y={Math.max(sy(hover.y) - 30, 4)} width="140" height="22" rx="6" fill="var(--text)" />
              <text x={Math.min(sx(hover.x) + 16, W - 142)} y={Math.max(sy(hover.y) - 15, 19)} fontSize="12" fill="var(--background)" fontFamily="var(--font-mono)">
                ({hover.x.toPrecision(3)}, {hover.y.toPrecision(3)})
              </text>
            </g>
          )}
        </svg>
      </div>
      <div className="flex gap-1">
        <button type="button" onClick={() => zoom(0.5)} className="rounded-[8px] p-2 text-muted hover:bg-surface-2" aria-label={labels.zoomIn}>
          <ZoomIn className="size-4" />
        </button>
        <button type="button" onClick={() => zoom(2)} className="rounded-[8px] p-2 text-muted hover:bg-surface-2" aria-label={labels.zoomOut}>
          <ZoomOut className="size-4" />
        </button>
        <span className="ms-2 self-center font-mono text-xs text-muted" dir="ltr">
          y = {expression}
        </span>
      </div>
    </div>
  );
}
