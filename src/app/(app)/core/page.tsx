"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ApPanel, GpaPanel } from "@/components/core/american";
import { CasPanel, EePanel, TokPanel } from "@/components/core/ib";
import { RubricFeedback } from "@/components/practice/rubric-feedback";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const IB = ["tok", "ee", "cas", "feedback"] as const;
const US = ["gpa", "ap", "feedback"] as const;

/** IB Core and college prep workspaces (section 12.2). IB students see TOK/EE/CAS; American, GPA and AP. */
function Core() {
  const t = useTranslations("core");
  const profile = useCurrentProfile();
  const params = useSearchParams();
  const router = useRouter();
  const ib = profile.packId === "ib-dp" || profile.packId === "ib-cp";
  const tabs: readonly string[] = ib ? IB : US;
  const all = [...new Set([...IB, ...US])];
  const tab = all.find((x) => x === params.get("tab")) ?? tabs[0];
  return (
    <>
      <PageHeader
        title={ib ? t("titleIb") : t("titleUs")}
        text={ib ? t("textIb") : t("textUs")}
        action={
          <div role="tablist" className="inline-flex flex-wrap rounded-[10px] bg-surface-2 p-1">
            {tabs.map((id) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => router.replace(`/core?tab=${id}`)} className={cn("rounded-[8px] px-3 py-2 text-sm font-medium", tab === id ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-text")}>
                {t(`tabs.${id}`)}
              </button>
            ))}
          </div>
        }
      />
      {tab === "tok" && <TokPanel />}
      {tab === "ee" && <EePanel />}
      {tab === "cas" && <CasPanel />}
      {tab === "gpa" && <GpaPanel />}
      {tab === "ap" && <ApPanel />}
      {tab === "feedback" && <RubricFeedback defaultRubric={ib ? "ib_ee" : "ap_essay"} />}
      <p className="text-xs text-muted">
        {t("honesty")}{" "}
        <Link href="/honesty" className="font-medium text-primary hover:underline">
          {t("honestyLink")}
        </Link>
      </p>
    </>
  );
}

export default function CorePage() {
  return (
    <Suspense>
      <Core />
    </Suspense>
  );
}
