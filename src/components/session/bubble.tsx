"use client";

import { AlertOctagon, Coffee, ExternalLink, FastForward, Pause, Play, Plus, Square, Timer, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { addDays, occurrences, sameDay, startOfDay } from "@/lib/calendar/logic";
import { useEvents } from "@/lib/calendar/use-events";
import {
  breakBankLeftMs,
  breakLeftMs,
  currentUnit,
  elapsedMs,
  focusScore,
  plannedMs,
  projectedFinish,
  session,
  syncServerTime,
  useSession,
  type SessionState,
} from "@/lib/session/store";
import { cn } from "@/lib/utils";

/** Soft two-note ping (Web Audio, no files). */
function ping() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.32);
    });
  } catch {
    /* audio blocked until the page is touched */
  }
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Re-renders every half second while a session is live. */
function useTick(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [active]);
}

type Tone = "running" | "break" | "paused" | "emergency" | "over" | "done" | "idle";

function toneOf(s: SessionState): Tone {
  if (s.status === "running" && elapsedMs(s) > plannedMs(s)) return "over";
  return s.status as Tone;
}
const TONE_COLOR: Record<Tone, string> = {
  running: "var(--primary)",
  break: "var(--success)",
  over: "var(--warning)",
  paused: "var(--muted)",
  emergency: "var(--muted)",
  done: "var(--success)",
  idle: "var(--primary)",
};

/** The round bubble face (also used in the pop-out window). */
function Face({ s, size = 56 }: { s: SessionState; size?: number }) {
  const tone = toneOf(s);
  const planned = plannedMs(s);
  const el = elapsedMs(s);
  const left = s.status === "break" ? breakLeftMs(s) : planned - el;
  const progress = s.status === "break" ? 1 - breakLeftMs(s) / Math.max(1, s.breakLengthMs) : planned ? Math.min(1, el / planned) : 0;
  const r = size / 2 - 4;
  const circ = 2 * Math.PI * r;
  const mins = Math.ceil(Math.abs(left) / 60000);
  return (
    <span className="relative flex items-center justify-center rounded-full bg-surface shadow-lg ring-1 ring-border" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="4" />
        {s.status !== "idle" && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={TONE_COLOR[tone]}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - progress)}
          />
        )}
      </svg>
      {s.status === "idle" || s.status === "done" ? (
        <Timer className="size-5 text-primary" aria-hidden />
      ) : (
        <span className="text-center font-mono text-sm font-semibold tabular-nums leading-none" style={{ color: TONE_COLOR[tone] }} dir="ltr">
          {left < 0 && "+"}
          {mins}
          <span className="block text-[9px] font-medium text-muted">min</span>
        </span>
      )}
    </span>
  );
}

/**
 * The timer bubble (section 12A.1): floats on every page, drag to move (snaps to the
 * nearest edge), tap to expand. Built from Today's plan.
 */
export function TimerBubble() {
  const t = useTranslations("bubble");
  const locale = useLocale();
  const s = useSession();
  const live = s.status !== "idle";
  useTick(live);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pos, setPos] = useState<{ side: "left" | "right"; y: number }>({ side: "right", y: 0.75 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const [pip, setPip] = useState<Window | null>(null);

  useEffect(() => {
    syncServerTime();
    try {
      const p = JSON.parse(localStorage.getItem("soussy.bubble.pos") ?? "null");
      if (p) setPos(p);
    } catch {
      /* ignore */
    }
  }, []);

  // Time warnings (2 min, 100%, 150%) and breaks ending. Runs on every tick on purpose;
  // each warning marks itself as done right away, so it can't loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (s.status === "break") session.endBreakIfOver();
    if (s.status !== "running") return;
    const u = currentUnit(s);
    const planned = plannedMs(s);
    const el = elapsedMs(s);
    if (!u || !planned) return;
    if (!s.warned.two && planned - el <= 120_000 && planned - el > 0) {
      session.markWarned("two");
      ping();
      setToast(t("twoLeft", { name: u.name }));
    } else if (!s.warned.full && el >= planned) {
      session.markWarned("full");
      ping();
      setOpen(true);
    } else if (!s.warned.over && el >= planned * 1.5) {
      session.markWarned("over");
      ping();
      setOpen(true);
    }
  });

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const savePos = (p: typeof pos) => {
    setPos(p);
    try {
      localStorage.setItem("soussy.bubble.pos", JSON.stringify(p));
    } catch {
      /* ignore */
    }
  };

  async function popOut() {
    const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window> } }).documentPictureInPicture;
    if (!dpip) return;
    const w = await dpip.requestWindow({ width: 220, height: 240 });
    // Copy styles so the bubble looks the same in the little window.
    document.querySelectorAll("style, link[rel=stylesheet]").forEach((n) => w.document.head.appendChild(n.cloneNode(true)));
    w.document.documentElement.className = document.documentElement.className;
    w.document.body.style.margin = "0";
    w.addEventListener("pagehide", () => setPip(null));
    setPip(w);
  }

  const u = currentUnit(s);
  const tone = toneOf(s);
  const label = live && u && s.status !== "done" ? t("unitOf", { n: s.index + 1, total: s.units.length, name: u.name }) : null;
  const style: React.CSSProperties = drag
    ? { left: drag.x - 28, top: drag.y - 28 }
    : {
        [pos.side]: "max(12px, env(safe-area-inset-" + pos.side + ", 0px))",
        top: `calc(${(pos.y * 100).toFixed(1)}% - 28px)`,
      };

  return (
    <>
      <div className="fixed z-30 flex flex-col items-center gap-1 md:z-30" style={style} data-testid="bubble">
        <button
          type="button"
          aria-label={`${t("label")}${label ? `: ${label}` : ""}`}
          aria-expanded={open}
          onPointerDown={(e) => {
            moved.current = false;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!(e.buttons & 1)) return;
            moved.current = true;
            setDrag({ x: e.clientX, y: e.clientY });
          }}
          onPointerUp={(e) => {
            if (drag) {
              savePos({ side: e.clientX < window.innerWidth / 2 ? "left" : "right", y: Math.min(0.92, Math.max(0.08, e.clientY / window.innerHeight)) });
              setDrag(null);
            }
            if (!moved.current) setOpen((o) => !o);
          }}
          className="touch-none select-none rounded-full transition-transform hover:scale-105 active:scale-95"
          style={{ cursor: drag ? "grabbing" : "grab" }}
        >
          <Face s={s} />
        </button>
        {label && !open && (
          <span className="max-w-40 truncate rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-medium text-text shadow ring-1 ring-border" style={{ color: tone === "over" ? "var(--warning)" : undefined }}>
            {label}
          </span>
        )}
      </div>

      {toast && (
        <div role="status" className="fixed bottom-[calc(96px+env(safe-area-inset-bottom))] start-1/2 z-50 -translate-x-1/2 rounded-full bg-text px-4 py-2 text-sm font-medium text-background shadow-lg rtl:translate-x-1/2 md:bottom-8">
          {toast}
        </div>
      )}

      {open && (
        <Panel
          s={s}
          onClose={() => setOpen(false)}
          onPopOut={"documentPictureInPicture" in window ? popOut : undefined}
          side={pos.side}
          locale={locale}
        />
      )}

      {pip &&
        createPortal(
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-background p-3">
            <Face s={s} size={96} />
            {label && <p className="text-center text-xs font-medium">{label}</p>}
            <div className="flex gap-1">
              {s.status === "running" ? (
                <Button size="sm" variant="outline" onClick={() => session.pause()}>
                  <Pause aria-hidden />
                </Button>
              ) : (
                <Button size="sm" onClick={() => session.resume()} disabled={!["paused", "break", "emergency"].includes(s.status)}>
                  <Play aria-hidden />
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => session.next()} disabled={!live || s.status === "done"}>
                <FastForward aria-hidden />
              </Button>
            </div>
          </div>,
          pip.document.body,
        )}
    </>
  );
}

function Panel({ s, onClose, onPopOut, side, locale }: { s: SessionState; onClose: () => void; onPopOut?: () => void; side: "left" | "right"; locale: string }) {
  const t = useTranslations("bubble");
  const u = currentUnit(s);
  const planned = plannedMs(s);
  const el = elapsedMs(s);
  const timeFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      role="dialog"
      aria-label={t("label")}
      className={cn(
        "fixed bottom-[calc(80px+env(safe-area-inset-bottom))] z-40 flex max-h-[75dvh] w-[min(92vw,340px)] flex-col gap-3 overflow-y-auto rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-2xl md:bottom-6",
        side === "right" ? "end-[max(12px,env(safe-area-inset-right))] md:end-24" : "start-[max(12px,env(safe-area-inset-left))] md:start-24",
      )}
      data-testid="bubble-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{s.status === "idle" ? t("plan") : t(`state.${toneOf(s)}` as "state.running")}</p>
        <div className="flex gap-1">
          {onPopOut && s.status !== "idle" && (
            <button type="button" onClick={onPopOut} className="rounded-[8px] p-1.5 text-muted hover:bg-surface-2" aria-label={t("popOut")} title={t("popOut")}>
              <ExternalLink className="size-4" />
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-[8px] p-1.5 text-muted hover:bg-surface-2" aria-label={t("collapse")}>
            <X className="size-4" />
          </button>
        </div>
      </div>

      {s.status === "idle" ? (
        <Planner onStarted={onClose} />
      ) : s.status === "done" ? (
        <Summary s={s} />
      ) : (
        <>
          {u && (
            <div>
              <p className="text-sm font-medium" dir="auto">
                {t("unitOf", { n: s.index + 1, total: s.units.length, name: u.name })}
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums" dir="ltr">
                {s.status === "break" ? fmt(breakLeftMs(s)) : el > planned ? `+${fmt(el - planned)}` : fmt(planned - el)}
              </p>
            </div>
          )}

          {/* 100% and 150% prompts */}
          {s.status === "running" && el >= planned * 1.5 ? (
            <p className="rounded-[10px] border border-warning bg-warning/20 p-3 text-sm font-medium">{t("over", { time: timeFmt.format(new Date(projectedFinish(s))) })}</p>
          ) : s.status === "running" && el >= planned ? (
            <p className="rounded-[10px] bg-warning/10 p-3 text-sm">{t("full", { planned: u?.minutes ?? 0, actual: Math.floor(el / 60000) })}</p>
          ) : null}
          {s.status === "emergency" && <p className="rounded-[10px] bg-surface-2 p-3 text-sm">{t("emergencyText")}</p>}

          <div className="grid grid-cols-2 gap-2">
            {s.status === "running" ? (
              <Button variant="outline" onClick={() => session.pause()}>
                <Pause aria-hidden />
                {t("pause")}
              </Button>
            ) : (
              <Button onClick={() => session.resume()}>
                <Play className="rtl:rotate-180" aria-hidden />
                {t("lockIn")}
              </Button>
            )}
            <Button variant="outline" onClick={() => session.next()}>
              <FastForward className="rtl:rotate-180" aria-hidden />
              {s.status === "running" && el >= planned ? t("finishUp") : t("nextUnit")}
            </Button>
            <Button variant="outline" onClick={() => session.addFive()}>
              <Plus aria-hidden />
              {t("addFive")}
            </Button>
            <Button variant="outline" onClick={() => session.takeBreak(Math.max(1, Math.min(10, Math.round(breakBankLeftMs(s) / 60000)) || 5))} disabled={s.status === "break"}>
              <Coffee aria-hidden />
              {t("takeBreak")}
            </Button>
          </div>
          {s.breakBankMs > 0 && <p className="text-xs text-muted">{t("breakLeft", { min: Math.round(breakBankLeftMs(s) / 60000) })}</p>}
          <Button variant="ghost" className="text-danger" onClick={() => session.emergency()} disabled={s.status === "emergency"}>
            <AlertOctagon aria-hidden />
            {t("emergency")}
          </Button>

          {s.units.length > s.index + 1 && (
            <section>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("remaining")}</p>
              <ul className="flex flex-col gap-1">
                {s.units.slice(s.index + 1).map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2 rounded-[8px] bg-surface-2/60 px-2 py-1 text-sm">
                    <span className="truncate" dir="auto">
                      {x.name}
                    </span>
                    <span className="flex items-center gap-1 tabular-nums text-muted">
                      {x.minutes}′
                      <button type="button" onClick={() => session.removeUnit(x.id)} className="p-0.5 hover:text-danger" aria-label="Remove">
                        <X className="size-3" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Button variant="ghost" size="sm" onClick={() => session.finish()}>
            <Square aria-hidden />
            {t("end")}
          </Button>
        </>
      )}
    </div>
  );
}

/** Build a session from Today's plan (section 12A.1: "Built from the student's daily list"). */
function Planner({ onStarted }: { onStarted: () => void }) {
  const t = useTranslations("bubble");
  const { events } = useEvents();
  const today = startOfDay(new Date());
  const fromPlan = useMemo(
    () =>
      occurrences(events, today, addDays(today, 1))
        .filter((o) => sameDay(o.start, today) && o.event.type !== "class" && o.event.status !== "done")
        .map((o) => ({ name: o.event.title, subject: o.event.subject_code, minutes: o.event.estimated_minutes ?? 25 })),
    [events], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [units, setUnits] = useState<{ name: string; subject: string | null; minutes: number }[]>([]);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState(25);
  const [bank, setBank] = useState(15);
  const [err, setErr] = useState(false);
  const picked = useCallback((n: string) => units.some((x) => x.name === n), [units]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t("planText")}</p>
      {fromPlan.length > 0 && (
        <section>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("fromPlan")}</p>
          <ul className="flex flex-col gap-1">
            {fromPlan.map((p) => (
              <li key={p.name}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={picked(p.name)}
                    onChange={() => setUnits((l) => (picked(p.name) ? l.filter((x) => x.name !== p.name) : [...l, p]))}
                  />
                  <span className="min-w-0 flex-1 truncate" dir="auto">
                    {p.name}
                  </span>
                  <span className="text-xs text-muted">{p.minutes}′</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setUnits((l) => [...l, { name: name.trim(), subject: null, minutes }]);
          setName("");
          setErr(false);
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("unitName")} aria-label={t("unitName")} className="h-9" dir="auto" />
        <Input type="number" min={1} max={240} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 25)} aria-label={t("minutes")} className="h-9 w-16" />
        <Button type="submit" size="sm" className="h-9">
          {t("addUnit")}
        </Button>
      </form>
      {units.filter((x) => !fromPlan.some((p) => p.name === x.name)).length > 0 && (
        <ul className="flex flex-col gap-1">
          {units
            .filter((x) => !fromPlan.some((p) => p.name === x.name))
            .map((x, i) => (
              <li key={`${x.name}-${i}`} className="flex justify-between rounded-[8px] bg-surface-2/60 px-2 py-1 text-sm">
                <span dir="auto">{x.name}</span>
                <span className="text-muted">{x.minutes}′</span>
              </li>
            ))}
        </ul>
      )}
      <label className="flex items-center justify-between gap-2 text-sm">
        {t("breakBank")}
        <Input type="number" min={0} max={120} value={bank} onChange={(e) => setBank(Number(e.target.value) || 0)} className="h-9 w-20" />
      </label>
      {err && <p className="text-sm text-danger">{t("noUnits")}</p>}
      <Button
        onClick={() => {
          if (!units.length) return setErr(true);
          session.start(units, bank);
          onStarted();
        }}
        data-testid="start-session"
      >
        <Play className="rtl:rotate-180" aria-hidden />
        {t("start")}
      </Button>
    </div>
  );
}

/** End of session: planned vs actual per unit, breaks, focus score, explain-back (section 12A.1). */
function Summary({ s }: { s: SessionState }) {
  const t = useTranslations("bubble.summary");
  const locale = useLocale();
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3" data-testid="summary">
      <p className="font-semibold">{t("title")}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th className="text-start font-medium">{t("unit")}</th>
            <th className="text-end font-medium">{t("planned")}</th>
            <th className="text-end font-medium">{t("actual")}</th>
          </tr>
        </thead>
        <tbody>
          {s.units.map((u) => (
            <tr key={u.id}>
              <td className="max-w-36 truncate py-0.5" dir="auto">
                {u.name}
              </td>
              <td className="text-end tabular-nums">{u.minutes}′</td>
              <td className={cn("text-end tabular-nums", u.actualMs > u.minutes * 60000 && "text-warning")}>{u.done ? `${Math.round(u.actualMs / 60000)}′` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm">{t("breaks", { min: Math.round(s.breakUsedMs / 60000) })}</p>
      <p className="text-sm font-medium text-success">{t("score", { pct: focusScore(s) })}</p>
      <section className="flex flex-col gap-2 rounded-[10px] bg-surface-2/60 p-3">
        <p className="text-sm font-semibold">{t("explainTitle")}</p>
        <p className="text-xs text-muted">{t("explainText")}</p>
        <textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} className="w-full rounded-[8px] border border-border bg-surface p-2 text-sm" dir="auto" aria-label={t("explainText")} />
        <Button
          size="sm"
          className="self-start"
          disabled={busy || answer.trim().length < 5}
          onClick={async () => {
            setBusy(true);
            const res = await fetch("/api/explain-back", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ studied: s.units.map((u) => u.name).join(", "), answer, language: locale }),
            }).catch(() => null);
            const data = res ? ((await res.json().catch(() => ({}))) as { feedback?: string; message?: string }) : {};
            setFeedback(data.feedback ?? data.message ?? "…");
            setBusy(false);
          }}
        >
          {t("send")}
        </Button>
        {feedback && (
          <p className="text-sm" dir="auto">
            {feedback}
          </p>
        )}
      </section>
      <Button variant="outline" onClick={() => session.clear()}>
        {t("close")}
      </Button>
    </div>
  );
}
