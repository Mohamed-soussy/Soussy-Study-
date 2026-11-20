import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Brand } from "@/components/brand/logo";
import { Card } from "@/components/ui/primitives";
import { SchoolStart } from "./start";

export const metadata: Metadata = { title: "Soussy Study for KiS" };

/**
 * School page (section 12.5): a landing page per school, starting with KiS, with the school
 * and its curricula preloaded so a new student onboards in about a minute.
 */
export default async function KisPage() {
  const t = await getTranslations("school.kis");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-10 ps-[max(16px,env(safe-area-inset-left))] pe-[max(16px,env(safe-area-inset-right))]">
      <Brand />
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-primary">{t("eyebrow")}</p>
        <h1 className="text-3xl font-bold sm:text-4xl">{t("title")}</h1>
        <p className="text-lg text-muted">{t("text")}</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <h2 className="font-semibold">{t("ibTitle")}</h2>
          <p className="text-sm text-muted">{t("ibText")}</p>
        </Card>
        <Card className="p-4">
          <h2 className="font-semibold">{t("usTitle")}</h2>
          <p className="text-sm text-muted">{t("usText")}</p>
        </Card>
      </div>
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        {(["teams", "lessons", "rooms", "free"] as const).map((k) => (
          <li key={k} className="rounded-[10px] bg-surface-2 p-3">{t(`points.${k}`)}</li>
        ))}
      </ul>
      <SchoolStart label={t("start")} />
      <p className="text-xs text-muted">{t("note")}</p>
    </div>
  );
}
