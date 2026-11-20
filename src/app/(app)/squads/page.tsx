"use client";

import { Plus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Input, PageHeader } from "@/components/ui/primitives";
import { getRepo7, type Squad } from "@/lib/data/repo7";

/** Squads (section 12.4): invite-only study groups of up to 8. */
export default function SquadsPage() {
  const t = useTranslations("squads");
  const profile = useCurrentProfile();
  const router = useRouter();
  const [list, setList] = useState<Squad[] | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const repo = getRepo7();
  useEffect(() => {
    repo.squads.mine().then(setList).catch(() => setList([]));
  }, [repo]);

  return (
    <>
      <PageHeader title={t("title")} text={t("text")} />
      {repo.mode === "demo" && <p className="self-start rounded-full bg-warning/15 px-3 py-1 text-sm font-medium text-text">{t("demo")}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="font-semibold">{t("create")}</h2>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (name.trim().length < 2) return;
              const s = await repo.squads.create(name.trim());
              router.push(`/squads/${s.id}`);
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} aria-label={t("name")} maxLength={60} dir="auto" />
            <Button type="submit" disabled={name.trim().length < 2}>
              <Plus aria-hidden />
              {t("createButton")}
            </Button>
          </form>
        </Card>
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="font-semibold">{t("join")}</h2>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                const id = await repo.squads.join(code, profile.nickname || profile.fullName?.split(" ")[0] || "Student");
                router.push(`/squads/${id}`);
              } catch (err) {
                setError(err instanceof Error ? err.message : t("joinFailed"));
              }
            }}
          >
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))} placeholder={t("code")} aria-label={t("code")} className="font-mono" />
            <Button type="submit" disabled={code.length < 6}>{t("joinButton")}</Button>
          </form>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        </Card>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("mine")}</h2>
        {list === null ? (
          <div className="h-20 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
        ) : list.length === 0 ? (
          <EmptyState icon={<Users className="size-8" />} title={t("empty")} text={t("emptyText")} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((s) => (
              <li key={s.id}>
                <Link href={`/squads/${s.id}`} className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-border bg-surface p-4 hover:border-primary">
                  <span className="font-semibold" dir="auto">{s.name}</span>
                  <span className="font-mono text-sm text-muted">{s.code}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-muted">{t("safety")}</p>
    </>
  );
}
