"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Job } from "@/lib/lessons/runner";
import { cn } from "@/lib/utils";

/** Progress line for a lesson being analyzed. */
export function JobProgress({ job }: { job: Job }) {
  const t = useTranslations("lessons.stage");
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
  const minutes = Math.max(1, Math.round(job.eta / 60));
  return (
    <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm">
        {job.stage === "error" ? <AlertTriangle className="size-4 text-danger" /> : <Loader2 className={cn("size-4 text-primary", job.stage !== "done" && "animate-spin")} />}
        <span className="font-medium">{t(job.stage, { done: job.done, total: job.total })}</span>
        {job.stage !== "done" && job.stage !== "error" && job.eta > 0 && <span className="text-muted">· {t("eta", { minutes })}</span>}
      </div>
      {job.stage !== "error" && job.stage !== "done" && (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${["transcribing", "finding", "slides"].includes(job.stage) ? Math.max(4, pct) : 8}%` }} />
        </div>
      )}
    </div>
  );
}

