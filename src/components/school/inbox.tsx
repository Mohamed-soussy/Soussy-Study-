"use client";

import { Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/primitives";
import type { CalendarEvent } from "@/lib/data/types";
import type { Enrollment } from "@/lib/profile/types";
import { ReviewItem } from "./review-item";

/**
 * "New from school" (section 10.4) and the calendar's Review tray: everything found in
 * lessons, Teams, calendar feeds, pasted text and files that waits for one tap.
 */
export function SchoolInbox({
  events,
  enrollments,
  onChanged,
  variant = "home",
}: {
  events: CalendarEvent[];
  enrollments: Enrollment[];
  onChanged: () => void;
  variant?: "home" | "calendar";
}) {
  const t = useTranslations("school.inbox");
  const [all, setAll] = useState(false);
  const items = events.filter((e) => e.in_review).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  if (!items.length) return null;
  const shown = all || variant === "calendar" ? items : items.slice(0, 4);
  return (
    <Card className="flex flex-col gap-3 border-primary/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Inbox className="size-5 text-primary" aria-hidden />
            {variant === "home" ? t("title", { count: items.length }) : t("reviewTitle", { count: items.length })}
          </h2>
          <p className="text-sm text-muted">{t("text")}</p>
        </div>
        {variant === "home" && (
          <Link href="/settings#connections" className="text-sm font-medium text-primary hover:underline">
            {t("connections")}
          </Link>
        )}
      </div>
      <div className="grid items-start gap-2 lg:grid-cols-2">
        {shown.map((e) => (
          <ReviewItem key={e.id} event={e} all={events} enrollments={enrollments} onChanged={onChanged} />
        ))}
      </div>
      {shown.length < items.length && (
        <button type="button" className="self-start text-sm font-medium text-primary hover:underline" onClick={() => setAll(true)}>
          {t("more", { count: items.length - shown.length })}
        </button>
      )}
    </Card>
  );
}
