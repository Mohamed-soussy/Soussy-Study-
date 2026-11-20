import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { TABS, visibleNav } from "@/components/shell/nav";
import { Card, PageHeader } from "@/components/ui/primitives";

/** Phone "More" tab: every tool not in the bottom bar. */
export default async function MorePage() {
  const t = await getTranslations("nav");
  const p = await getTranslations("pages");
  const inTabs = new Set(TABS.map((x) => x.href));
  const items = visibleNav(undefined).filter((n) => !inTabs.has(n.href));

  return (
    <>
      <PageHeader title={t("more")} text={p("moreText")} />
      <Card className="divide-y divide-border">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="flex h-14 items-center gap-3 px-4 hover:bg-surface-2">
              <Icon className="size-5 text-primary" aria-hidden />
              <span className="flex-1 font-medium text-text">{t(item.key)}</span>
              {item.phase && <span className="text-xs text-muted">{p("phase", { phase: item.phase })}</span>}
              <ChevronRight className="size-4 text-muted rtl:rotate-180" aria-hidden />
            </Link>
          );
        })}
      </Card>
    </>
  );
}
