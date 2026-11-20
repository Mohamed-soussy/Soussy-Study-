import type { Metadata } from "next";
import { Brand } from "@/components/brand/logo";
import { Card } from "@/components/ui/primitives";
import { admin } from "@/lib/school/microsoft";

export const metadata: Metadata = { title: "Weekly summary" };
export const dynamic = "force-dynamic";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Parent view (section 12.5, optional and student-controlled): a read-only weekly summary
 * at a private link the student made and can switch off. No files, chats or grades.
 */
export default async function ParentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !/^[0-9a-f]{32,64}$/.test(token)) return <Gone />;
  const db = admin();
  const { data: p } = await db.from("profiles").select("id,full_name").eq("parent_token", token).maybeSingle();
  if (!p) return <Gone />;
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const [{ data: days }, { data: xp }, { data: events }] = await Promise.all([
    db.from("study_days").select("day,minutes,questions,correct").eq("user_id", p.id).gte("day", ymd(new Date(now.getTime() - 28 * 864e5))),
    db.from("xp_events").select("kind,created_at").eq("user_id", p.id).eq("kind", "task").gte("created_at", weekStart.toISOString()),
    db.from("events").select("title,type,starts_at,status").eq("user_id", p.id).in("type", ["test", "submission"]).neq("status", "done").gte("starts_at", now.toISOString()).lte("starts_at", new Date(now.getTime() + 14 * 864e5).toISOString()).order("starts_at").limit(8),
  ]);
  const week = (days ?? []).filter((d) => d.day >= ymd(weekStart));
  const minutes = week.reduce((s, d) => s + d.minutes, 0);
  const q = week.reduce((s, d) => s + d.questions, 0);
  const c = week.reduce((s, d) => s + d.correct, 0);
  const name = (p.full_name as string | null)?.split(/\s+/)[0] ?? "Your child";
  return (
    <div dir="ltr" lang="en" className="mx-auto flex max-w-2xl flex-col gap-5 py-10 ps-[max(16px,env(safe-area-inset-left))] pe-[max(16px,env(safe-area-inset-right))]">
      <Brand />
      <h1 className="text-2xl font-bold">{name}&apos;s week on Soussy Study</h1>
      <div className="grid grid-cols-3 gap-3 text-center">
        <Card className="p-4"><p className="text-sm text-muted">Studied</p><p className="text-2xl font-bold">{(minutes / 60).toFixed(1)} h</p></Card>
        <Card className="p-4"><p className="text-sm text-muted">Days active</p><p className="text-2xl font-bold">{week.filter((d) => d.minutes >= 10).length}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted">Tasks done</p><p className="text-2xl font-bold">{xp?.length ?? 0}</p></Card>
      </div>
      {q > 0 && <p className="text-sm text-muted">Practice accuracy this week: {Math.round((c / q) * 100)}% over {q} answers.</p>}
      <Card className="p-4">
        <h2 className="font-semibold">Coming up (next 2 weeks)</h2>
        {events?.length ? (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {events.map((e, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>{e.title}</span>
                <span className="shrink-0 text-muted">{new Date(e.starts_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">No tests or big deadlines saved.</p>
        )}
      </Card>
      <p className="text-xs text-muted">{name} chose to share this summary and can turn the link off at any time. It never shows files, chats, lesson recordings, camera images or grades.</p>
    </div>
  );
}

function Gone() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-xl font-bold">This summary link isn&apos;t active</h1>
      <p className="mt-2 text-muted">The student may have switched it off.</p>
    </div>
  );
}
