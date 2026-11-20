"use client";

import { Bookmark, Globe, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CommunityVault } from "@/components/vault/community";
import { ResourceFinder } from "@/components/vault/finder";
import { SavedResources } from "@/components/vault/saved";
import { PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "community", icon: Users },
  { id: "find", icon: Globe },
  { id: "saved", icon: Bookmark },
] as const;

/** Past-student vault (section 9): the community vault, the resource finder, and saved links. */
function Vault() {
  const t = useTranslations("vault");
  const params = useSearchParams();
  const router = useRouter();
  const tab = TABS.find((x) => x.id === params.get("tab"))?.id ?? "community";
  return (
    <>
      <PageHeader
        title={t("title")}
        text={t("text")}
        action={
          <div role="tablist" aria-label={t("title")} className="inline-flex flex-wrap rounded-[10px] bg-surface-2 p-1">
            {TABS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => router.replace(`/vault?tab=${id}`)}
                className={cn("inline-flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-sm font-medium", tab === id ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-text")}
              >
                <Icon className="size-4" aria-hidden />
                {t(`tabs.${id}`)}
              </button>
            ))}
          </div>
        }
      />
      {tab === "community" ? <CommunityVault /> : tab === "find" ? <ResourceFinder /> : <SavedResources />}
    </>
  );
}

export default function VaultPage() {
  return (
    <Suspense>
      <Vault />
    </Suspense>
  );
}
