"use client";

import { AlertOctagon, Coffee, FastForward, Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { breakLeftMs, currentUnit, elapsedMs, plannedMs, session, syncServerTime, useSession } from "@/lib/session/store";

const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Phone as remote (section 4A): big buttons for the shared study session. */
export default function RemotePage() {
  const t = useTranslations("remote");
  const b = useTranslations("bubble");
  const s = useSession();
  const [, tick] = useState(0);
  useEffect(() => {
    syncServerTime();
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  const u = currentUnit(s);
  const live = s.status !== "idle" && s.status !== "done";

  return (
    <>
      <PageHeader title={t("title")} text={t("text")} />
      {!live || !u ? (
        <EmptyState title={t("none")} className="py-16" />
      ) : (
        <Card className="flex flex-col items-center gap-6 p-6">
          <p className="text-center text-lg font-semibold" dir="auto">
            {b("unitOf", { n: s.index + 1, total: s.units.length, name: u.name })}
          </p>
          <p className="font-mono text-6xl font-semibold tabular-nums" dir="ltr" data-testid="remote-time">
            {s.status === "break" ? fmt(breakLeftMs(s)) : fmt(plannedMs(s) - elapsedMs(s))}
          </p>
          <p className="text-sm text-muted">{b(`state.${s.status === "running" && elapsedMs(s) > plannedMs(s) ? "over" : s.status}` as "state.running")}</p>
          <div className="grid w-full max-w-sm grid-cols-2 gap-3">
            {s.status === "running" ? (
              <Button size="lg" variant="outline" className="h-16" onClick={() => session.pause()}>
                <Pause aria-hidden />
                {b("pause")}
              </Button>
            ) : (
              <Button size="lg" className="h-16" onClick={() => session.resume()}>
                <Play className="rtl:rotate-180" aria-hidden />
                {b("lockIn")}
              </Button>
            )}
            <Button size="lg" variant="outline" className="h-16" onClick={() => session.next()}>
              <FastForward className="rtl:rotate-180" aria-hidden />
              {b("nextUnit")}
            </Button>
            <Button size="lg" variant="outline" className="h-16" onClick={() => session.takeBreak(5)} disabled={s.status === "break"}>
              <Coffee aria-hidden />
              {b("takeBreak")}
            </Button>
            <Button size="lg" variant="outline" className="h-16 text-danger" onClick={() => session.emergency()}>
              <AlertOctagon aria-hidden />
              {b("emergency")}
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
