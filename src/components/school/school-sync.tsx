"use client";

import { useEffect } from "react";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { SYNC_EVERY_MS, syncAll } from "@/lib/school/sync";

/** Background sync (section 10.2): on app open, then every 30 minutes while it stays open. */
export function SchoolSync() {
  const profile = useCurrentProfile();
  const ready = profile.enrollments.length > 0;
  useEffect(() => {
    if (!ready) return;
    const run = () => {
      if (document.visibilityState === "visible") syncAll(profile.enrollments).catch(() => {});
    };
    const first = setTimeout(run, 4000); // let the page settle first
    const timer = setInterval(run, SYNC_EVERY_MS);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
    };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
