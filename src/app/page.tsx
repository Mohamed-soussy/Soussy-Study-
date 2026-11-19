import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo, Wordmark } from "@/components/brand/logo";
import { LocaleSwitch } from "@/components/locale-switch";
import { Button } from "@/components/ui/button";
import { LessonPreview, TimerPreview, WhiteboardPreview } from "./landing-previews";

/**
 * Logged-out landing page (section 2A): one screen only — logo, a one-line
 * promise, three short live previews and one "Start free" button.
 */
export default async function Landing() {
  const t = await getTranslations("landing");

  return (
    <div className="flex min-h-dvh flex-col ps-[max(16px,env(safe-area-inset-left))] pe-[max(16px,env(safe-area-inset-right))]">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between py-4">
        <span className="inline-flex min-w-0 items-center gap-2">
          <Logo size={32} />
          <Wordmark className="hidden min-[400px]:inline" />
        </span>
        <div className="flex items-center gap-1">
          <LocaleSwitch />
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">{t("signIn")}</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-10 py-8">
        <div className="flex max-w-2xl flex-col items-center gap-5 text-center">
          <Logo size={64} />
          <h1 className="text-3xl font-extrabold tracking-tight text-text sm:text-5xl">{t("promise")}</h1>
          <Button asChild size="lg" className="mt-1 px-8">
            <Link href="/sign-in">{t("startFree")}</Link>
          </Button>
          <p className="text-sm text-muted">{t("freeNote")}</p>
        </div>

        <ul className="grid w-full gap-4 sm:grid-cols-3" aria-label={t("previewLabel")}>
          <WhiteboardPreview title={t("previewWhiteboard")} text={t("previewWhiteboardText")} />
          <TimerPreview title={t("previewTimer")} text={t("previewTimerText")} />
          <LessonPreview
            title={t("previewLesson")}
            text={t("previewLessonText")}
            quote={t("previewLessonQuote")}
            result={t("previewLessonResult")}
          />
        </ul>
      </main>
    </div>
  );
}
