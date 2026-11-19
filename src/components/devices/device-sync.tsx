"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getRepo3 } from "@/lib/data/repo3";
import { connect, guessDeviceName, onMessage, sync, type DeviceRole } from "@/lib/devices/sync";
import { deviceId, getSession, onLocalChange, receive, session } from "@/lib/session/store";

export const ROLE_ROUTE: Record<DeviceRole, string> = {
  everything: "/home",
  remote: "/remote",
  flashcards: "/flashcards",
  chat: "/hub",
  camera: "/focus",
  scanner: "/scan",
  whiteboard: "/whiteboard",
};

export function deviceName(): string {
  try {
    return localStorage.getItem("soussy.device.name") || guessDeviceName();
  } catch {
    return guessDeviceName();
  }
}

/** Which device plays audio (section 4A: "Choose which device plays the audio"). */
export function audioDevice(): string | null {
  try {
    return localStorage.getItem("soussy.audio.device");
  } catch {
    return null;
  }
}
export function playsAudioHere(): boolean {
  const a = audioDevice();
  return !a || a === deviceId();
}

/**
 * Keeps this device in the student's live study session (section 4A): shares the timer,
 * receives "Send to my other device", remote-control actions, scans and role changes.
 */
export function DeviceSync() {
  const t = useTranslations("devices");
  const router = useRouter();
  const [toast, setToast] = useState<{ text: string; url?: string } | null>(null);

  useEffect(() => {
    let off1 = () => {};
    let off2 = () => {};
    const me = deviceId();
    const name = deviceName();
    connect(me, name)
      .then((tr) => {
        getRepo3().devices.upsert({ id: me, name }).catch(() => {});
        // Share this device's session changes with linked devices.
        off1 = onLocalChange((state) => tr.send({ type: "session", state }));
        off2 = onMessage((m) => {
          switch (m.type) {
            case "session":
              receive(m.state);
              break;
            case "hello":
              if (getSession().updatedAt) tr.send({ type: "session", state: getSession() });
              break;
            case "send":
              if (!m.to || m.to === me) setToast({ text: t("received", { from: m.fromName, title: m.title }), url: m.url });
              break;
            case "scan":
              setToast({ text: t("scanReceived", { from: m.fromName, name: m.name }), url: `/hub/file/${m.fileId}` });
              break;
            case "remote":
              if (m.action === "break") session.takeBreak(5);
              else session[m.action]();
              break;
            case "role":
              if (m.deviceId === me) router.push(ROLE_ROUTE[m.role]);
              break;
            case "audio":
              try {
                localStorage.setItem("soussy.audio.device", m.deviceId);
              } catch {
                /* ignore */
              }
              break;
            case "linked":
              if (m.deviceId === me) setToast({ text: t("linkedToast") });
              break;
          }
        });
        tr.send({ type: "hello", from: me });
      })
      .catch(() => {
        /* signed out or realtime unavailable: the app still works on this device alone */
      });
    return () => {
      off1();
      off2();
    };
  }, [router, t]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 12000);
    return () => clearTimeout(id);
  }, [toast]);

  if (!toast) return null;
  return (
    <div role="status" className="fixed top-[calc(72px+env(safe-area-inset-top))] start-1/2 z-50 flex w-[min(92vw,420px)] -translate-x-1/2 items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-xl rtl:translate-x-1/2" data-testid="device-toast">
      <p className="min-w-0 flex-1 text-sm" dir="auto">
        {toast.text}
      </p>
      {toast.url && (
        <Button
          size="sm"
          onClick={() => {
            router.push(toast.url!);
            setToast(null);
          }}
        >
          {t("open")}
        </Button>
      )}
      <button type="button" onClick={() => setToast(null)} className="p-1 text-muted" aria-label="Close">
        <X className="size-4" />
      </button>
    </div>
  );
}

/** "Send to my other device": shares the current page (section 4A). */
export function sendToOtherDevice(url: string, title: string) {
  sync()?.send({ type: "send", url, title, from: deviceId(), fromName: deviceName() });
}
