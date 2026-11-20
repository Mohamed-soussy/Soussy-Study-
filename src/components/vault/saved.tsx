"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, Chip, EmptyState } from "@/components/ui/primitives";
import { getRepo6, type SavedResource } from "@/lib/data/repo6";

/** "Save to my vault": the link plus the student's own notes about it (section 9.1). */
export function SavedResources() {
  const t = useTranslations("vault.saved");
  const profile = useCurrentProfile();
  const [list, setList] = useState<SavedResource[] | null>(null);
  const load = () => getRepo6().saved.list().then(setList).catch(() => setList([]));
  useEffect(() => {
    load();
  }, []);
  if (list === null) return <div className="h-24 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />;
  if (!list.length) return <EmptyState title={t("empty")} text={t("emptyText")} />;
  return (
    <ul className="grid items-start gap-3 md:grid-cols-2">
      {list.map((r) => (
        <li key={r.id}>
          <Card className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {r.kind && <Chip>{r.kind.replace(/_/g, " ")}</Chip>}
              {r.subject_code && <Chip>{profile.enrollments.find((e) => e.subjectId === r.subject_code)?.name ?? r.subject_code}</Chip>}
              {r.unit && <span className="text-xs text-muted" dir="auto">{r.unit}</span>}
            </div>
            <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold hover:underline" dir="auto">
              {r.title} <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            </a>
            <p className="text-xs text-muted">{r.source}</p>
            {r.summary && <p className="whitespace-pre-line text-sm text-muted" dir="auto">{r.summary}</p>}
            <textarea
              defaultValue={r.notes ?? ""}
              placeholder={t("notesPlaceholder")}
              aria-label={t("notes")}
              rows={2}
              dir="auto"
              onBlur={(e) => e.target.value !== (r.notes ?? "") && getRepo6().saved.update(r.id, { notes: e.target.value })}
              className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <Button size="sm" variant="ghost" className="self-start" onClick={async () => { await getRepo6().saved.remove(r.id); load(); }}>
              <Trash2 aria-hidden />
              {t("remove")}
            </Button>
          </Card>
        </li>
      ))}
    </ul>
  );
}
