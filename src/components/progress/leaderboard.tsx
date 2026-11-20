"use client";

import { Trophy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Card, Input, Select } from "@/components/ui/primitives";
import { saveProfile } from "@/lib/profile/store";
import { ageOn } from "@/lib/profile/types";
import { listStudyDays } from "@/lib/progress/study";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface Row {
  rank: number;
  name: string;
  minutes: number;
  on_task: number | null;
  questions: number;
  accuracy: number | null;
  units: number;
  is_me: boolean;
}

type Scope = "school" | "grade" | "subject" | "public";

/**
 * Leaderboards (section 12B): opt-in, nicknames on public boards, verified hours only, top 10
 * plus your own place, never a highlighted last place. Under-13s never appear publicly.
 */
export function Leaderboards() {
  const t = useTranslations("progress.boards");
  const profile = useCurrentProfile();
  const sb = getSupabaseBrowser();
  const [optIn, setOptIn] = useState(Boolean(profile.leaderboardOptIn));
  const [realName, setRealName] = useState(Boolean(profile.leaderboardRealName));
  const [nickname, setNickname] = useState(profile.nickname ?? "");
  const [scope, setScope] = useState<Scope>("school");
  const [subject, setSubject] = useState(profile.enrollments[0]?.subjectId ?? "");
  const [period, setPeriod] = useState<"week" | "all">("week");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saved, setSaved] = useState("");
  const under13 = profile.dateOfBirth ? ageOn(profile.dateOfBirth) < 13 : false;

  const load = useCallback(async () => {
    if (!optIn) return setRows(null);
    if (!sb) {
      // Demo: there are no other accounts, so the board shows only you.
      const days = await listStudyDays();
      const from = new Date();
      from.setDate(from.getDate() - from.getDay());
      const key = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
      const mine = days.filter((d) => period === "all" || d.day >= key);
      const q = mine.reduce((s, d) => s + d.questions, 0);
      setRows([
        {
          rank: 1,
          name: nickname || t("you"),
          minutes: mine.reduce((s, d) => s + (scope === "subject" ? d.subject_minutes[subject] ?? 0 : d.minutes), 0),
          on_task: mine.length ? Math.round(mine.reduce((s, d) => s + (d.on_task_pct ?? 0), 0) / mine.length) : null,
          questions: q,
          accuracy: q ? Math.round((mine.reduce((s, d) => s + d.correct, 0) / q) * 100) : null,
          units: mine.reduce((s, d) => s + d.units, 0),
          is_me: true,
        },
      ]);
      return;
    }
    const { data } = await sb.rpc("leaderboard", { scope: scope === "subject" ? "school" : scope, period, subject: scope === "subject" ? subject : null, lim: 10 });
    setRows((data ?? []) as Row[]);
  }, [optIn, sb, scope, period, subject, nickname, t]);
  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = async (patch: { leaderboardOptIn?: boolean; leaderboardRealName?: boolean; nickname?: string }) => {
    await saveProfile({ ...profile, leaderboardOptIn: optIn, leaderboardRealName: realName, nickname, ...patch });
    setSaved(t("saved"));
  };
  const h = (m: number) => (m / 60).toFixed(1);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Trophy className="size-5 text-warning" aria-hidden />
          {t("title")}
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={optIn}
            onChange={(e) => {
              setOptIn(e.target.checked);
              saveSettings({ leaderboardOptIn: e.target.checked });
            }}
            className="size-4 accent-[var(--primary)]"
          />
          {t("join")}
        </label>
      </div>
      {!optIn ? (
        <p className="text-sm text-muted">{t("optInText")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">{t("nickname")}</span>
              <Input value={nickname} onChange={(e) => setNickname(e.target.value.slice(0, 30))} onBlur={() => saveSettings({ nickname })} className="h-9 w-44" dir="auto" />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={realName}
                onChange={(e) => {
                  setRealName(e.target.checked);
                  saveSettings({ leaderboardRealName: e.target.checked });
                }}
                className="size-4 accent-[var(--primary)]"
              />
              {t("realName")}
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <div role="tablist" className="inline-flex flex-wrap rounded-[10px] bg-surface-2 p-1">
              {(["school", "grade", "subject", ...(under13 ? [] : ["public"])] as Scope[]).map((s) => (
                <button key={s} type="button" role="tab" aria-selected={scope === s} onClick={() => setScope(s)} className={cn("rounded-[8px] px-3 py-1.5 text-sm font-medium", scope === s ? "bg-surface text-primary shadow-sm" : "text-muted")}>
                  {t(`scopes.${s}`)}
                </button>
              ))}
            </div>
            {scope === "subject" && (
              <Select value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9 w-auto" aria-label={t("subject")}>
                {profile.enrollments.map((e) => (
                  <option key={e.subjectId} value={e.subjectId}>
                    {e.name}
                  </option>
                ))}
              </Select>
            )}
            <Select value={period} onChange={(e) => setPeriod(e.target.value as "week" | "all")} className="h-9 w-auto" aria-label={t("period")}>
              <option value="week">{t("week")}</option>
              <option value="all">{t("all")}</option>
            </Select>
          </div>
          {!sb && <p className="self-start rounded-full bg-warning/15 px-3 py-0.5 text-xs font-medium text-text">{t("demo")}</p>}
          {rows && rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="text-muted">
                    <th className="py-1 text-start font-medium">#</th>
                    <th className="py-1 text-start font-medium">{t("name")}</th>
                    <th className="py-1 text-end font-medium">{t("hours")}</th>
                    {scope !== "public" && (
                      <>
                        <th className="py-1 text-end font-medium">{t("onTask")}</th>
                        <th className="py-1 text-end font-medium">{t("questions")}</th>
                        <th className="py-1 text-end font-medium">{t("correct")}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.rank}-${r.name}`} className={cn("border-t border-border", r.is_me && "bg-primary-soft font-medium")}>
                      <td className="py-1.5 tabular-nums">{r.rank}</td>
                      <td className="py-1.5" dir="auto">
                        {r.name} {r.is_me && <span className="text-xs text-primary">({t("you")})</span>}
                      </td>
                      <td className="py-1.5 text-end tabular-nums">{h(Number(r.minutes) || 0)}</td>
                      {scope !== "public" && (
                        <>
                          <td className="py-1.5 text-end tabular-nums">{r.on_task != null ? `${r.on_task}%` : "—"}</td>
                          <td className="py-1.5 text-end tabular-nums">{r.questions ?? 0}</td>
                          <td className="py-1.5 text-end tabular-nums">{r.accuracy != null ? `${r.accuracy}%` : "—"}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">{t("empty")}</p>
          )}
          <p className="text-xs text-muted">{t("rules")}</p>
        </>
      )}
      {saved && <p className="sr-only" role="status">{saved}</p>}
    </Card>
  );
}
