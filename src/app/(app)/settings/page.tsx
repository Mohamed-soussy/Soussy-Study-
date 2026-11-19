"use client";

import { Download, LogOut, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { DevicesPanel } from "@/components/devices/devices-panel";
import { Button } from "@/components/ui/button";
import { Card, Chip, PageHeader } from "@/components/ui/primitives";
import { getPack } from "@/curriculum";
import { setLocale, setTheme } from "@/i18n/actions";
import { THEME_COOKIE, type ThemeChoice } from "@/i18n/config";
import { signOut } from "@/lib/profile/store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn, subjectColor } from "@/lib/utils";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium text-text">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-[10px] bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[8px] px-3 py-1.5 text-sm font-medium",
            value === o.value ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  const c = useTranslations("common");
  const packsT = useTranslations("curriculum.packs");
  const yearsT = useTranslations("curriculum.years");
  const levelsT = useTranslations("curriculum.levels");
  const profile = useCurrentProfile();
  const locale = useLocale();
  const router = useRouter();
  const [, start] = useTransition();
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  const pack = getPack(profile.packId);
  const year = pack?.years.find((y) => y.id === profile.year);

  useEffect(() => {
    const m = document.cookie.match(new RegExp(`${THEME_COOKIE}=(\\w+)`));
    if (m && ["light", "dark", "system"].includes(m[1])) setThemeState(m[1] as ThemeChoice);
  }, []);

  function changeTheme(v: ThemeChoice) {
    setThemeState(v);
    // Apply instantly, then save for next visit.
    if (v === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", v);
    start(() => setTheme(v));
  }

  return (
    <>
      <PageHeader
        title={t("title")}
        text={t("text")}
        action={
          <Button asChild>
            <Link href="/onboarding?step=3">{t("redo")}</Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("profile")}</h2>
          <Card className="flex flex-col gap-4 p-4">
            <div>
              <p className="font-semibold text-text">{profile.fullName}</p>
              <p className="text-sm text-muted">{[profile.school, profile.city, profile.country].filter(Boolean).join(" · ")}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("curriculum")}</p>
              <p className="text-sm text-text">
                {pack && packsT(pack.nameKey)}
                {year && <> · {yearsT(year.labelKey)}</>}
                {profile.examSession && <> · {profile.examSession}</>}
              </p>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("subjects")}</p>
              <ul className="flex flex-wrap gap-2">
                {profile.enrollments.map((e) => (
                  <li key={e.subjectId}>
                    <Chip color={subjectColor(e.color)}>
                      {e.name}
                      {e.level !== "None" && <span className="text-muted">{levelsT(e.level)}</span>}
                    </Chip>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("language")} · {t("theme")}</h2>
          <Card className="divide-y divide-border">
            <Row label={t("language")}>
              <Toggle
                label={t("language")}
                value={locale}
                onChange={(v) =>
                  start(async () => {
                    await setLocale(v);
                    router.refresh();
                  })
                }
                options={[
                  { value: "en", label: "English" },
                  { value: "ar", label: "العربية" },
                ]}
              />
            </Row>
            <Row label={t("theme")}>
              <Toggle
                label={t("theme")}
                value={theme}
                onChange={changeTheme}
                options={[
                  { value: "system", label: t("themeSystem") },
                  { value: "light", label: t("themeLight") },
                  { value: "dark", label: t("themeDark") },
                ]}
              />
            </Row>
            <Row label={t("accountMode")}>
              <p className="text-sm text-muted">{isSupabaseConfigured ? t("accountLive") : t("accountDemo")}</p>
            </Row>
          </Card>

          <DevicesPanel />

          <h2 className="mt-3 text-lg font-semibold">{t("privacy")}</h2>
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled>
                <Download aria-hidden />
                {t("download")}
              </Button>
              <Button variant="outline" disabled>
                <Trash2 aria-hidden />
                {t("delete")}
              </Button>
            </div>
            <p className="text-sm text-muted">{t("privacyLater")}</p>
          </Card>

          <Button
            variant="ghost"
            className="self-start text-danger"
            onClick={async () => {
              await signOut();
              router.replace("/");
              router.refresh();
            }}
          >
            <LogOut className="rtl:rotate-180" aria-hidden />
            {c("signOut")}
          </Button>
        </section>
      </div>
    </>
  );
}
