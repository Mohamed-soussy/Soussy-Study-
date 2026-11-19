"use client";

import { Camera, CameraOff, Cloud, Coffee, Eye, EyeOff, Maximize, Pause, Play, ShieldCheck, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, Chip, Field, Input, PageHeader } from "@/components/ui/primitives";
import { createDetector, snapshot, type Detector } from "@/lib/focus/detector";
import { initialRuleState, step, wasWrong, type FocusEvent, type RuleState, type Sensitivity, type Signals } from "@/lib/focus/rules";
import { ageOn } from "@/lib/profile/types";
import { breakLeftMs, currentUnit, elapsedMs, plannedMs, serverNow, session, syncServerTime, useSession } from "@/lib/session/store";
import { cn } from "@/lib/utils";

/* ---------- small storage helpers (per device conveniences) ---------- */
const PREFS = "soussy.focus.prefs";
interface Prefs {
  consent: "on" | "notnow" | null;
  cloud: boolean;
  preview: boolean;
  sensitivity: Sensitivity;
}
function loadPrefs(): Prefs {
  try {
    return { consent: null, cloud: false, preview: true, sensitivity: "normal", ...JSON.parse(localStorage.getItem(PREFS) ?? "{}") };
  } catch {
    return { consent: null, cloud: false, preview: true, sensitivity: "normal" };
  }
}
function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

type Mode = "setup" | "focus" | "paused" | "break" | "done";
type CheckIn = { kind: "phone" | "tired" | "lookAway" | "back"; reply?: string } | null;

/** Focus room (section 12A): timer, Full Focus Mode and optional camera focus. */
export default function FocusPage() {
  const t = useTranslations("focus");
  const cam = useTranslations("focus.camera");
  const sig = useTranslations("focus.signals");
  const ci = useTranslations("focus.checkin");
  const profile = useCurrentProfile();
  const under18 = profile.dateOfBirth ? ageOn(profile.dateOfBirth) < 18 : false;

  const [task, setTask] = useState("");
  const [minutes, setMinutes] = useState(25);
  // The timer is the shared study session (same as the bubble and linked devices).
  const sess = useSession();
  const [, setTick] = useState(0);
  useEffect(() => {
    syncServerTime();
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  const mode: Mode =
    sess.status === "idle" ? "setup" : sess.status === "running" ? "focus" : sess.status === "break" ? "break" : sess.status === "done" ? "done" : "paused";
  const left = plannedMs(sess) - elapsedMs(sess);
  const breakLeft = breakLeftMs(sess);
  const focusedMs = sess.focusedMs + (sess.status === "running" && sess.runStartedAt ? serverNow() - sess.runStartedAt : 0);
  const setMode = (m: Mode) => {
    if (m === "focus") session.resume();
    else if (m === "paused") session.pause();
    else if (m === "break") session.takeBreak(5);
    else if (m === "done") session.finish();
    else session.clear();
  };

  // Full Focus Mode
  const [fullscreen, setFullscreen] = useState(false);
  const [leaves, setLeaves] = useState(0);
  const [awayNotice, setAwayNotice] = useState<string | null>(null);
  const leftAt = useRef<number | null>(null);

  // Camera
  const [prefs, setPrefs] = useState<Prefs>({ consent: null, cloud: false, preview: true, sensitivity: "normal" });
  const [camState, setCamState] = useState<"off" | "loading" | "on" | "denied" | "unsupported">("off");
  const [learnMore, setLearnMore] = useState(false);
  const [cloudAsk, setCloudAsk] = useState(false);
  const [signals, setSignals] = useState<Signals | null>(null);
  const [cloudState, setCloudState] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState<CheckIn>(null);
  const [wrongNote, setWrongNote] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<Detector | null>(null);
  const rulesRef = useRef<RuleState>(initialRuleState(Date.now()));
  const lastActivity = useRef(Date.now());
  const modeRef = useRef<Mode>("setup");
  modeRef.current = mode;

  useEffect(() => setPrefs(loadPrefs()), []);
  const updatePrefs = (p: Partial<Prefs>) =>
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      savePrefs(next);
      return next;
    });

  // Activity in the app = progress (typing, clicking, scrolling).
  useEffect(() => {
    const mark = () => (lastActivity.current = Date.now());
    const evs = ["keydown", "pointerdown", "wheel", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    return () => evs.forEach((e) => window.removeEventListener(e, mark));
  }, []);

  useEffect(() => {
    if (mode === "break") session.endBreakIfOver();
    if (mode === "done" && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  });

  /* ---------- Full Focus Mode: fullscreen + leave detection ---------- */
  useEffect(() => {
    const onFs = () => {
      const fs = Boolean(document.fullscreenElement);
      setFullscreen(fs);
      if (!fs && modeRef.current === "focus") {
        leftAt.current ??= Date.now();
      }
    };
    const onHide = () => {
      const active = modeRef.current === "focus";
      if (document.visibilityState === "hidden" && active) {
        leftAt.current ??= Date.now();
        setLeaves((n) => n + 1);
        setMode("paused"); // the timer doesn't run while you're elsewhere
      } else if (document.visibilityState === "visible" && leftAt.current) {
        setAwayNotice(fmt(Date.now() - leftAt.current));
        leftAt.current = null;
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  // Ask before closing the tab mid-session.
  useEffect(() => {
    if (mode !== "focus" && mode !== "paused") return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [mode]);

  async function enterFull() {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch {
      /* phones and some app views don't allow fullscreen; leave detection still works */
    }
  }

  function start() {
    session.start([{ name: task.trim() || t("taskPlaceholder"), subject: null, minutes }], 0);
    setLeaves(0);
    rulesRef.current = initialRuleState(Date.now());
  }

  /* ---------- camera (on-device) ---------- */
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    detectorRef.current?.close();
    detectorRef.current = null;
    setSignals(null);
    setCamState((s) => (s === "denied" || s === "unsupported" ? s : "off"));
  }, []);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState("unsupported");
      return;
    }
    setCamState("loading");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      detectorRef.current = await createDetector();
      setCamState("on");
    } catch (err) {
      stopCamera();
      setCamState(err instanceof DOMException && err.name === "NotAllowedError" ? "denied" : "unsupported");
    }
  }

  useEffect(() => () => stopCamera(), [stopCamera]);

  const handleEvents = useCallback(
    (events: FocusEvent[]) => {
      for (const e of events) {
        if (e === "autoPause" && modeRef.current === "focus") setMode("paused");
        if (e === "back") setCheckIn((c) => (c?.kind === "back" ? c : modeRef.current === "paused" ? { kind: "back" } : c));
        if (e === "phone" || e === "tired" || e === "lookAway") setCheckIn({ kind: e });
      }
    },
    [],
  );

  // Check one frame every 2.5 s; the frame is analysed in memory and dropped.
  useEffect(() => {
    if (camState !== "on") return;
    const id = setInterval(() => {
      const v = videoRef.current;
      const d = detectorRef.current;
      if (!v || !d || v.readyState < 2) return;
      const s = d.detect(v);
      setSignals(s);
      if (modeRef.current === "focus" || modeRef.current === "paused") {
        const active = Date.now() - lastActivity.current < 30_000;
        const r = step(rulesRef.current, Date.now(), s, active, prefs.sensitivity);
        rulesRef.current = r.state;
        handleEvents(r.events);
      }
    }, 2500);
    return () => clearInterval(id);
  }, [camState, prefs.sensitivity, handleEvents]);

  // Opt-in cloud check: one small photo every 2 minutes, only while focusing.
  useEffect(() => {
    if (camState !== "on" || !prefs.cloud || mode !== "focus") return;
    const run = async () => {
      const v = videoRef.current;
      const img = v && snapshot(v);
      if (!img) return;
      const res = await fetch("/api/focus/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: img, consent: true }),
      }).catch(() => null);
      if (res?.ok) setCloudState(((await res.json()) as { state: string }).state);
    };
    const first = setTimeout(run, 5000);
    const id = setInterval(run, 120_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [camState, prefs.cloud, mode]);

  /* ---------- UI ---------- */
  const total = Math.max(1, plannedMs(sess));
  const progress = mode === "setup" ? 0 : 1 - left / total;
  const ringColor = mode === "break" ? "var(--success)" : mode === "paused" ? "var(--muted)" : left < 0 ? "var(--warning)" : "var(--primary)";
  const r = 88;
  const circ = 2 * Math.PI * r;
  const signalLabel = signals
    ? !signals.face
      ? sig("absent")
      : signals.phone
        ? sig("phone")
        : signals.eyesClosed
          ? sig("drowsy")
          : signals.yaw > 35
            ? sig("away")
            : sig("present")
    : null;

  return (
    <>
      <PageHeader title={t("title")} text={t("text")} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Timer and Full Focus Mode */}
        <section className="flex min-w-0 flex-col gap-4">
          {mode === "setup" ? (
            <Card className="flex flex-col gap-4 p-5">
              <Field label={t("task")} htmlFor="focus-task">
                <Input id="focus-task" value={task} onChange={(e) => setTask(e.target.value)} placeholder={t("taskPlaceholder")} />
              </Field>
              <Field label={t("minutes")} htmlFor="focus-min">
                <div className="flex flex-wrap gap-2">
                  {[15, 25, 45, 60].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMinutes(m)}
                      aria-pressed={minutes === m}
                      className={cn("rounded-full border px-4 py-1.5 text-sm font-medium", minutes === m ? "border-primary bg-primary-soft text-primary" : "border-border text-muted")}
                    >
                      {m}
                    </button>
                  ))}
                  <Input id="focus-min" type="number" min={5} max={180} value={minutes} onChange={(e) => setMinutes(Math.min(180, Math.max(5, Number(e.target.value) || 25)))} className="h-9 w-24" />
                </div>
              </Field>
              <Button size="lg" onClick={start} className="self-start">
                <Play className="rtl:rotate-180" aria-hidden />
                {t("start")}
              </Button>
            </Card>
          ) : (
            <Card className="flex flex-col items-center gap-5 p-6">
              <p className="text-center text-lg font-semibold" dir="auto">
                {currentUnit(sess)?.name ?? (task || t("taskPlaceholder"))}
              </p>
              <div className="relative flex size-52 items-center justify-center">
                <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90" aria-hidden>
                  <circle cx="100" cy="100" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
                  <circle
                    cx="100"
                    cy="100"
                    r={r}
                    fill="none"
                    stroke={ringColor}
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    strokeDashoffset={circ * (1 - (mode === "break" ? 1 : progress))}
                    style={{ transition: "stroke-dashoffset 0.5s linear" }}
                  />
                </svg>
                <div className="text-center">
                  <p dir="ltr" className="font-mono text-4xl font-semibold tabular-nums" data-testid="timer">
                    {mode === "break" ? fmt(breakLeft) : fmt(left)}
                  </p>
                  <p className="text-sm text-muted">
                    {mode === "break" ? t("statusBreak") : mode === "paused" ? t("paused") : mode === "done" ? "✓" : t("remaining")}
                  </p>
                </div>
              </div>
              {mode === "done" ? (
                <div className="flex flex-col items-center gap-3">
                  <p className="font-medium text-success">{t("done", { minutes: Math.round(focusedMs / 60000) })}</p>
                  <Button onClick={() => setMode("setup")}>{t("start")}</Button>
                </div>
              ) : (
                <div className="flex flex-wrap justify-center gap-2">
                  {mode === "focus" ? (
                    <Button variant="outline" onClick={() => setMode("paused")}>
                      <Pause aria-hidden />
                      {t("pause")}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        setMode("focus");
                        setCheckIn(null);
                        setAwayNotice(null);
                      }}
                    >
                      <Play className="rtl:rotate-180" aria-hidden />
                      {t("resume")}
                    </Button>
                  )}
                  <Button variant="ghost" className="text-danger" onClick={() => setMode("done")}>
                    <Square aria-hidden />
                    {t("end")}
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted" data-testid="leaves">
                {t("leftCount", { count: leaves })}
              </p>
            </Card>
          )}

          {/* Full Focus Mode */}
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{t("fullFocus")}</p>
                <p className="text-sm text-muted">{t("fullFocusText")}</p>
              </div>
              {fullscreen ? (
                <Button variant="outline" onClick={() => document.exitFullscreen().catch(() => {})}>
                  {t("exitFull")}
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    if (mode === "setup") start();
                    enterFull();
                  }}
                >
                  <Maximize aria-hidden />
                  {t("enterFull")}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted">{t("fullFocusNote")}</p>
          </Card>

          {/* Notices and check-ins (section 12A.3) */}
          {awayNotice && (
            <Card className="flex flex-wrap items-center gap-3 border-warning/60 p-4" role="status">
              <p className="min-w-0 flex-1">{t("left", { time: awayNotice })}</p>
              <Button
                onClick={() => {
                  setAwayNotice(null);
                  setMode("focus");
                  enterFull();
                }}
              >
                {t("backIn")}
              </Button>
            </Card>
          )}
          {checkIn && (
            <Card className="flex flex-col gap-3 border-primary/40 p-4" role="status" data-testid="checkin">
              {checkIn.reply ? (
                <p>{checkIn.reply}</p>
              ) : checkIn.kind === "phone" ? (
                <>
                  <p className="font-semibold">❓ {ci("phoneTitle")}</p>
                  <p>{ci("phoneText")}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setCheckIn({ kind: "phone", reply: ci("studyReply") })}>
                      {ci("study")}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setMode("break");
                        setCheckIn({ kind: "phone", reply: ci("breakReply") });
                      }}
                    >
                      {ci("break")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setMode("paused");
                        setCheckIn({ kind: "phone", reply: ci("emergencyReply") });
                      }}
                    >
                      {ci("emergency")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p>{checkIn.kind === "tired" ? ci("tiredText") : checkIn.kind === "back" ? ci("awayText") : ci("lookText")}</p>
                  <div className="flex flex-wrap gap-2">
                    {checkIn.kind === "tired" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setMode("break");
                          setCheckIn(null);
                        }}
                      >
                        <Coffee aria-hidden />
                        {ci("takeBreak")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => {
                        if (modeRef.current === "paused") setMode("focus");
                        setCheckIn(null);
                      }}
                    >
                      {ci("keepGoing")}
                    </Button>
                  </div>
                </>
              )}
              {checkIn.kind !== "back" && (
                <button
                  type="button"
                  className="self-start text-xs font-medium text-muted underline"
                  onClick={() => {
                    rulesRef.current = wasWrong(rulesRef.current, Date.now());
                    setCheckIn(null);
                    setWrongNote(true);
                    setTimeout(() => setWrongNote(false), 3000);
                  }}
                >
                  {cam("wrong")}
                </button>
              )}
            </Card>
          )}
          {wrongNote && <p className="text-sm text-muted">{cam("wrongDone")}</p>}
        </section>

        {/* Camera focus mode */}
        <aside className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{cam("title")}</h2>
              {camState === "on" && (
                <Chip color="var(--success)">
                  <Camera className="size-3" aria-hidden />
                  {cam("on")}
                </Chip>
              )}
            </div>

            <div className={cn("relative overflow-hidden rounded-[10px] bg-surface-2", !(prefs.preview && camState === "on") && "hidden")}>
              <video ref={videoRef} muted playsInline className="block aspect-[4/3] w-full -scale-x-100 object-cover" aria-label={cam("title")} />
              {signalLabel && <span className="absolute bottom-2 start-2 rounded-full bg-surface/90 px-2 py-0.5 text-xs font-medium">{signalLabel}</span>}
            </div>
            {prefs.consent !== "on" && camState === "off" ? (
              <div className="flex flex-col gap-3">
                <p className="font-medium">{cam("consentTitle")}</p>
                <p className="text-sm text-muted">{cam("consentText")}</p>
                {learnMore && <p className="rounded-[10px] bg-surface-2 p-3 text-sm">{cam("learnMoreText")}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      updatePrefs({ consent: "on" });
                      startCamera();
                    }}
                  >
                    {cam("turnOn")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => updatePrefs({ consent: "notnow" })}>
                    {cam("notNow")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setLearnMore((v) => !v)}>
                    {cam("learnMore")}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {!prefs.preview && camState === "on" && signalLabel && <Chip>{signalLabel}</Chip>}
                {camState === "loading" && <p className="text-sm text-muted">{cam("loading")}</p>}
                {camState === "denied" && <p className="text-sm text-danger">{cam("denied")}</p>}
                {camState === "unsupported" && <p className="text-sm text-danger">{cam("unsupported")}</p>}
                <p className="flex items-start gap-1.5 text-xs text-muted">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                  {cam("local")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {camState === "on" || camState === "loading" ? (
                    <Button size="sm" variant="outline" onClick={stopCamera}>
                      <CameraOff aria-hidden />
                      {cam("off")}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={startCamera}>
                      <Camera aria-hidden />
                      {cam("turnOn")}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => updatePrefs({ preview: !prefs.preview })} aria-pressed={prefs.preview}>
                    {prefs.preview ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                    {cam("preview")}
                  </Button>
                </div>
                <label className="flex items-center justify-between gap-2 text-sm">
                  <span>{cam("sensitivity")}</span>
                  <select
                    value={prefs.sensitivity}
                    onChange={(e) => updatePrefs({ sensitivity: e.target.value as Sensitivity })}
                    className="h-9 rounded-[8px] border border-border bg-surface px-2"
                  >
                    {(["relaxed", "normal", "strict"] as const).map((s) => (
                      <option key={s} value={s}>
                        {cam(s)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </Card>

          {/* Opt-in cloud checks: off by default, separate consent. */}
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-semibold">
                <Cloud className="size-4 text-muted" aria-hidden />
                {cam("cloudTitle")}
              </h2>
              <Chip>{prefs.cloud ? cam("cloudOn") : cam("cloudOff")}</Chip>
            </div>
            <p className="text-sm text-muted">{cam("cloudText")}</p>
            {prefs.cloud ? (
              <>
                {cloudState && <p className="text-sm">{cam("cloudLast", { state: sig(cloudState as "present") })}</p>}
                <Button size="sm" variant="outline" className="self-start" onClick={() => updatePrefs({ cloud: false })}>
                  {cam("cloudOff")}
                </Button>
              </>
            ) : cloudAsk ? (
              <div className="flex flex-col gap-2 rounded-[10px] border border-warning/50 bg-warning/10 p-3">
                <p className="text-sm">{cam("cloudWarning")}</p>
                {under18 && <p className="text-sm font-medium">{cam("under18")}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      updatePrefs({ cloud: true });
                      setCloudAsk(false);
                    }}
                  >
                    {cam("cloudAgree")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCloudAsk(false)}>
                    {cam("notNow")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="self-start" onClick={() => setCloudAsk(true)} disabled={camState !== "on"}>
                {cam("turnOn")}
              </Button>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
