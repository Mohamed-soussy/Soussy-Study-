import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Brand } from "@/components/brand/logo";
import { Card } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Terms and privacy" };

/** Full terms, privacy policy and community rules (linked from onboarding step 0). */
export default async function LegalPage() {
  const t = await getTranslations("legal");
  const sections = [
    { id: "terms", title: t("termsTitle"), body: t("termsBody") },
    { id: "privacy", title: t("privacyTitle"), body: t("privacyBody") },
    { id: "rules", title: t("rulesTitle"), body: t("rulesBody") },
  ];
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-8 ps-[max(16px,env(safe-area-inset-left))] pe-[max(16px,env(safe-area-inset-right))]">
      <Brand />
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-2 inline-block rounded-full bg-warning/15 px-3 py-0.5 text-sm font-medium text-text">{t("draft")}</p>
      </div>
      {sections.map((s) => (
        <Card key={s.id} id={s.id} className="p-5">
          <h2 className="text-lg font-semibold">{s.title}</h2>
          <p className="mt-2 max-w-prose text-muted">{s.body}</p>
        </Card>
      ))}
      <Link href="/onboarding" className="text-sm font-medium text-primary hover:underline">
        {t("backToSetup")}
      </Link>
    </div>
  );
}
