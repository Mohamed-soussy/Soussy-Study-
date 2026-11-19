"use client";

import { MessageCircle, FolderOpen, Video } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ChatTab } from "@/components/hub/chat-tab";
import { FilesTab } from "@/components/hub/files-tab";
import { PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** Study Hub (section 6): the material vault and the AI tutor, as two tabs. */
function Hub() {
  const t = useTranslations("hub");
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") === "files" ? "files" : "chat";

  const tabs = [
    { id: "chat", label: t("tabChat"), icon: MessageCircle },
    { id: "files", label: t("tabFiles"), icon: FolderOpen },
  ] as const;

  return (
    <>
      <PageHeader
        title={t("title")}
        text={t("text")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="tablist"
              aria-label={t("title")}
              className="inline-flex rounded-[10px] bg-surface-2 p-1"
            >
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={tab === id}
                  onClick={() => router.replace(`/hub?tab=${id}`)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[8px] px-4 py-2 text-sm font-medium",
                    tab === id
                      ? "bg-surface text-primary shadow-sm"
                      : "text-muted hover:text-text",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
            {/* Lessons live in their own section and are reachable from here too (section 11). */}
            <Link
              href="/lessons"
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-sm font-medium text-muted hover:text-text"
            >
              <Video className="size-4" aria-hidden />
              {t("lessons")}
            </Link>
          </div>
        }
      />
      {tab === "chat" ? <ChatTab /> : <FilesTab />}
    </>
  );
}

export default function HubPage() {
  return (
    <Suspense>
      <Hub />
    </Suspense>
  );
}
