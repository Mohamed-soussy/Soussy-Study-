import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Brand } from "@/components/brand/logo";
import { Card } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "How to use AI honestly" };

/**
 * "How to use AI honestly" (section 14), matching IB academic integrity guidance: what the AI
 * will and won't do, and how to cite Soussy Study when your school asks.
 */
export default async function HonestyPage() {
  const t = await getTranslations("honesty");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 py-8 ps-[max(16px,env(safe-area-inset-left))] pe-[max(16px,env(safe-area-inset-right))]">
      <Brand />
      <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
      <p className="text-muted">{t("intro")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <h2 className="font-semibold text-success">{t("doTitle")}</h2>
          <ul className="mt-2 list-disc ps-5 text-sm">
            {(["d1", "d2", "d3", "d4", "d5"] as const).map((k) => <li key={k}>{t(`do.${k}`)}</li>)}
          </ul>
        </Card>
        <Card className="p-4">
          <h2 className="font-semibold text-danger">{t("dontTitle")}</h2>
          <ul className="mt-2 list-disc ps-5 text-sm">
            {(["n1", "n2", "n3", "n4"] as const).map((k) => <li key={k}>{t(`dont.${k}`)}</li>)}
          </ul>
        </Card>
      </div>
      <Card className="flex flex-col gap-2 p-4">
        <h2 className="font-semibold">{t("citeTitle")}</h2>
        <p className="text-sm text-muted">{t("citeText")}</p>
        <code className="block rounded-[10px] bg-surface-2 p-3 text-sm" dir="ltr">
          Soussy Study (AI tutor using Groq and Gemini models). Prompt: &quot;…&quot;. Used to [explain / quiz me on / give feedback on] … {today}.
        </code>
        <p className="text-sm text-muted">{t("citeIb")}</p>
      </Card>
      <Card className="p-4">
        <h2 className="font-semibold">{t("estimatesTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("estimatesText")}</p>
      </Card>
      <Link href="/home" className="text-sm font-medium text-primary hover:underline">{t("back")}</Link>
    </div>
  );
}
