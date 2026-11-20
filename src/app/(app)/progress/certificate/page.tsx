"use client";

import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { getRepo6, type CommunityNote } from "@/lib/data/repo6";

/**
 * Contributor certificate (section 9.2): what the student shared with other students. They
 * check with their CAS coordinator whether it counts toward CAS or service.
 */
export default function CertificatePage() {
  const t = useTranslations("progress.cert");
  const locale = useLocale();
  const profile = useCurrentProfile();
  const [notes, setNotes] = useState<CommunityNote[]>([]);
  useEffect(() => {
    getRepo6().notes.mine().then((n) => setNotes(n.filter((x) => x.status === "approved"))).catch(() => {});
  }, []);
  const ratings = notes.reduce((s, n) => s + n.rating_count, 0);
  const avg = ratings ? notes.reduce((s, n) => s + n.rating_avg * n.rating_count, 0) / ratings : 0;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Button variant="outline" className="self-end print:hidden" onClick={() => window.print()}>
        <Printer aria-hidden />
        {t("print")}
      </Button>
      <article className="flex flex-col items-center gap-5 rounded-[var(--radius-card)] border-4 border-double border-primary/40 bg-surface p-8 text-center print:border-primary">
        <Logo />
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted">{t("presented")}</p>
        <p className="text-2xl font-semibold" dir="auto">
          {profile.fullName ?? profile.nickname ?? ""}
        </p>
        <p className="max-w-prose">{t("body", { notes: notes.length, ratings, avg: avg.toFixed(1) })}</p>
        {notes.length > 0 && (
          <ul className="w-full max-w-md text-start text-sm">
            {notes.slice(0, 12).map((n) => (
              <li key={n.id} className="flex justify-between gap-3 border-b border-border py-1">
                <span dir="auto">{n.title}</span>
                <span className="shrink-0 text-muted">
                  {n.subject_name} · ★ {n.rating_avg.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-muted">{new Date().toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}</p>
        <p className="text-xs text-muted">{t("cas")}</p>
      </article>
    </div>
  );
}
