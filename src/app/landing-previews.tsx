"use client";

import { CalendarCheck, Mic } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/primitives";

/** Three short, looping previews on the landing page (section 2A). Purely illustrative. */

function PreviewCard({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <li>
      <Card className="flex h-full flex-col gap-3 p-4 transition-shadow hover:shadow-md">
        <div className="flex h-32 items-center justify-center overflow-hidden rounded-[10px] bg-surface-2">{children}</div>
        <div>
          <p className="font-display font-semibold text-text">{title}</p>
          <p className="text-sm text-muted">{text}</p>
        </div>
      </Card>
    </li>
  );
}

/** A marker draws a sine wave with a labeled tangent, like the AI whiteboard. */
export function WhiteboardPreview({ title, text }: { title: string; text: string }) {
  const reduce = useReducedMotion();
  const draw = (delay: number) =>
    reduce
      ? { initial: { pathLength: 1 }, animate: { pathLength: 1 } }
      : {
          initial: { pathLength: 0 },
          animate: { pathLength: 1 },
          transition: { duration: 1.4, delay, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut" as const },
        };
  return (
    <PreviewCard title={title} text={text}>
      <svg viewBox="0 0 200 100" className="h-full w-full" aria-hidden direction="ltr">
        <line x1="12" y1="50" x2="188" y2="50" stroke="var(--border)" strokeWidth="1.5" />
        <line x1="20" y1="10" x2="20" y2="90" stroke="var(--border)" strokeWidth="1.5" />
        <motion.path
          d="M20 50 C40 10 60 10 75 50 S110 90 130 50 S165 10 185 50"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          {...draw(0)}
        />
        <motion.path d="M45 22 L95 22" stroke="var(--danger)" strokeWidth="2.5" strokeLinecap="round" {...draw(1.2)} />
        <text x="128" y="90" fontSize="11" fill="var(--muted)" fontFamily="var(--font-mono)">
          f′(x) = 0
        </text>
      </svg>
    </PreviewCard>
  );
}

/** A focus timer bubble counting down. */
export function TimerPreview({ title, text }: { title: string; text: string }) {
  const [secs, setSecs] = useState(25 * 60);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => (s <= 0 ? 25 * 60 : s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const progress = 1 - secs / (25 * 60);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const r = 34;
  const circ = 2 * Math.PI * r;
  return (
    <PreviewCard title={title} text={text}>
      <div className="relative flex size-24 items-center justify-center rounded-full bg-surface shadow-md">
        <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="40" cy="40" r={r} fill="none" stroke="var(--primary-soft)" strokeWidth="5" />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - Math.max(progress, 0.08))}
          />
        </svg>
        <span dir="ltr" className="font-mono text-lg font-semibold tabular-nums text-text">
          {mm}:{ss}
        </span>
      </div>
    </PreviewCard>
  );
}

/** A spoken line from a lesson turns into a homework card. */
export function LessonPreview({ title, text, quote, result }: { title: string; text: string; quote: string; result: string }) {
  const reduce = useReducedMotion();
  return (
    <PreviewCard title={title} text={text}>
      <div className="flex w-full flex-col gap-2 px-3">
        <div className="flex items-start gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-xs text-muted shadow-sm">
          <Mic className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
          <span>{quote}</span>
        </div>
        <motion.div
          className="flex items-center gap-2 rounded-lg border-s-4 border-primary bg-surface px-2.5 py-1.5 text-xs font-medium text-text shadow-sm"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? undefined : { duration: 0.4, delay: 1, repeat: Infinity, repeatDelay: 3, repeatType: "reverse" }}
        >
          <CalendarCheck className="size-3.5 text-primary" aria-hidden />
          {result}
        </motion.div>
      </div>
    </PreviewCard>
  );
}
