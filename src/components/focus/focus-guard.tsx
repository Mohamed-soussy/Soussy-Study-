"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { createDetector, type Detector } from "@/lib/focus/detector";
import { initialRuleState, step, type RuleState, type Sensitivity } from "@/lib/focus/rules";
import { session, useSession } from "@/lib/session/store";

/** Set by the Focus page when the student turns the camera on (and cleared when they turn it off). */
export const CAM_FLAG = "soussy.focus.camOn";
const MOTIVATION = 12;

type Popup = { kind: "back" | "phone" | "look"; msg: number; reply?: string } | null;

/**
 * Focus mode everywhere (section 12A): while a focus session runs, the student can use the whole
 * app (Study Hub, Notes, Whiteboard…). The camera keeps checking on every page (on the device),
 * and leaving the Soussy Study tab brings a motivational message on return.
 * The Focus page has its own camera and notices, so this stays quiet there.
 */
export function FocusGuard() {
  const t = useTranslations("focus.guard");
  const ci = useTranslations("focus.checkin");
  const sess = useSession();
  const path = usePathname();
  const running = sess.status === "running" || sess.status === "paused";
  const onFocusPage = path === "/focus";
  const [popup, setPopup] = useState<Popup>(null);
  const titleRef = useRef<string | null>(null);
  const pick = () => Math.floor(Math.random() * MOTIVATION) + 1;

  // Leaving the tab: change the tab title to call them back; on return, a motivational message.
  useEffect(() => {
    if (!running || onFocusPage) return;
    let left = false;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        left = true;
        titleRef.current ??= document.title;
        document.title = t("tabTitle");
        try {
          if ("Notification" in window && Notification.permission === "granted") new Notification(t("notifyTitle"), { body: t("notifyBody"), tag: "soussy-focus" });
        } catch {
          /* ignore */
        }
      } else if (left) {
        left = false;
        if (titleRef.current) document.title = titleRef.current;
        titleRef.current = null;
        setPopup({ kind: "back", msg: pick() });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (titleRef.current) document.title = titleRef.current;
      titleRef.current = null;
    };
  }, [running, onFocusPage, t]);

  // The camera keeps checking on every page (on this device only; frames are never stored).
  const video = useRef<HTMLVideoElement | null>(null);
  const rules = useRef<RuleState>(initialRuleState(Date.now()));
  const lastActivity = useRef(Date.now());
  useEffect(() => {
    const mark = () => (lastActivity.current = Date.now());
    const evs = ["keydown", "pointerdown", "wheel", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    return () => evs.forEach((e) => window.removeEventListener(e, mark));
  }, []);

  const camWanted = (() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(CAM_FLAG) === "1";
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    if (!running || onFocusPage || !camWanted || sess.status !== "running") return;
    let stream: MediaStream | null = null;
    let detector: Detector | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let alive = true;
    let sensitivity: Sensitivity = "normal";
    try {
      sensitivity = (JSON.parse(localStorage.getItem("soussy.focus.prefs") ?? "{}").sensitivity as Sensitivity) ?? "normal";
    } catch {
      /* default */
    }
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: "user" }, audio: false });
        if (!alive) return stream.getTracks().forEach((x) => x.stop());
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.srcObject = stream;
        await v.play().catch(() => {});
        video.current = v;
        detector = await createDetector();
        rules.current = initialRuleState(Date.now());
        timer = setInterval(() => {
          if (!video.current || !detector || video.current.readyState < 2) return;
          const s = detector.detect(video.current);
          const r = step(rules.current, Date.now(), s, Date.now() - lastActivity.current < 30_000, sensitivity);
          rules.current = r.state;
          if (r.events.includes("phone")) setPopup((p) => p ?? { kind: "phone", msg: pick() });
          else if (r.events.includes("lookAway")) setPopup((p) => p ?? { kind: "look", msg: pick() });
        }, 1000);
      } catch {
        /* no camera here: leave detection still works */
      }
    })();
    return () => {
      alive = false;
      clearInterval(timer);
      detector?.close();
      stream?.getTracks().forEach((x) => x.stop());
      video.current = null;
    };
  }, [running, onFocusPage, camWanted, sess.status]);

  useEffect(() => {
    if (!popup?.reply) return;
    const id = setTimeout(() => setPopup(null), 3500);
    return () => clearTimeout(id);
  }, [popup]);

  const takeBreak = useCallback(() => {
    session.takeBreak(5);
    setPopup((p) => (p ? { ...p, reply: ci("breakReply") } : p));
  }, [ci]);

  if (!popup || onFocusPage) return null;
  if (popup.reply)
    return (
      <div className="fixed inset-x-0 top-4 z-[80] flex justify-center px-4" role="status">
        <p className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-on-primary shadow-lg">{popup.reply}</p>
      </div>
    );
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4">
      <Card className="flex w-full max-w-xl flex-col gap-4 p-6 text-lg shadow-2xl sm:p-8" role="alertdialog" aria-modal>
        <p className="text-5xl" aria-hidden>{popup.kind === "phone" ? "📱" : popup.kind === "look" ? "👀" : "💪"}</p>
        <p className="text-2xl font-bold">{popup.kind === "phone" ? ci("phoneTitle") : popup.kind === "look" ? ci("lookTitle") : t("backTitle")}</p>
        <p>{popup.kind === "phone" ? ci("phoneText") : popup.kind === "look" ? ci("lookText") : t(`motivation.${popup.msg}`)}</p>
        {popup.kind === "back" ? (
          <Button size="lg" onClick={() => setPopup(null)}>{t("backButton")}</Button>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Button size="lg" onClick={() => setPopup((p) => (p ? { ...p, reply: ci("studyReply") } : p))}>📚 {popup.kind === "phone" ? ci("study") : ci("lookFocused")}</Button>
            <Button size="lg" variant="secondary" onClick={takeBreak}>☕ {popup.kind === "phone" ? ci("break") : ci("lookDistracted")}</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
