"use client";

import { ClipboardCheck, FileCheck2, GraduationCap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MockExam } from "@/components/practice/mock-exam";
import { RubricFeedback } from "@/components/practice/rubric-feedback";
import { TeachBack } from "@/components/practice/teach-back";
import { PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "exam", icon: FileCheck2 },
  { id: "teach", icon: GraduationCap },
  { id: "feedback", icon: ClipboardCheck },
] as const;

/** Practice (section 12.1 and 6A): mock exams, teach-back, rubric feedback. */
function Practice() {
  const t = useTranslations("practice");
  const params = useSearchParams();
  const router = useRouter();
  const tab = TABS.find((x) => x.id === params.get("tab"))?.id ?? "exam";
  return (
    <>
      <PageHeader
        title={t("title")}
        text={t("text")}
        action={
          <div role="tablist" className="inline-flex flex-wrap rounded-[10px] bg-surface-2 p-1">
            {TABS.map(({ id, icon: Icon }) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => router.replace(`/exam?tab=${id}`)} className={cn("inline-flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-sm font-medium", tab === id ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-text")}>
                <Icon className="size-4" aria-hidden />
                {t(`tabs.${id}`)}
              </button>
            ))}
          </div>
        }
      />
      {tab === "exam" ? <MockExam /> : tab === "teach" ? <TeachBack /> : <RubricFeedback />}
    </>
  );
}

export default function PracticePage() {
  return (
    <Suspense>
      <Practice />
    </Suspense>
  );
}
