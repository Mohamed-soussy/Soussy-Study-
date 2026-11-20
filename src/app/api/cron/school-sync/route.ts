import { NextResponse, type NextRequest } from "next/server";
import type { CalendarEvent } from "@/lib/data/types";
import type { Connection } from "@/lib/lessons/repo";
import type { Enrollment } from "@/lib/profile/types";
import { planItems } from "@/lib/school/match";
import { accessToken, admin, msConfig } from "@/lib/school/microsoft";
import { fetchMicrosoft, importTranscripts, level3 } from "@/lib/school/ms-fetch";
import { msToItems } from "@/lib/school/normalize";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Background school sync (section 10.2, Level 3): Supabase pg_cron calls this every 30
 * minutes, so a new Teams assignment reaches the student's "New from school" even when the
 * app is closed. Protected by CRON_SECRET. Students synced longest ago go first.
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!msConfig().configured) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const db = admin();
  const started = Date.now();
  const { data: conns } = await db.from("connections").select("*").eq("provider", "microsoft").order("last_sync", { ascending: true, nullsFirst: true }).limit(200);
  const report = { users: 0, created: 0, updated: 0, merged: 0, conflicts: 0, transcripts: 0, errors: 0 };

  for (const c of (conns ?? []) as (Connection & { user_id: string })[]) {
    if (Date.now() - started > 45_000) break; // finish the rest next time
    if (c.last_sync && Date.now() - new Date(c.last_sync).getTime() < 25 * 60_000) continue;
    try {
      const t = await accessToken(c.user_id);
      if (!t) continue;
      const data = await fetchMicrosoft(t.access, { calendar: c.settings.calendar !== false, assignments: c.settings.assignments !== false, files: false });
      const { data: rows } = await db.from("enrollments").select("subject_code,subject_name,level,color").eq("user_id", c.user_id);
      const enrollments: Enrollment[] = (rows ?? []).map((r) => ({ subjectId: r.subject_code, name: r.subject_name, level: r.level as Enrollment["level"], color: r.color }));
      const { data: events } = await db.from("events").select("*").eq("user_id", c.user_id);
      const plans = planItems(msToItems(data, c, enrollments), (events ?? []) as CalendarEvent[]);
      const inserts = plans.filter((p) => p.action === "create" || p.action === "conflict").map((p) => ({ ...(p as { event: object }).event, user_id: c.user_id }));
      if (inserts.length) await db.from("events").insert(inserts);
      for (const p of plans) if (p.action === "update" || p.action === "merge") await db.from("events").update(p.patch).eq("id", p.id).eq("user_id", c.user_id);
      for (const p of plans) report[p.action === "create" ? "created" : p.action === "update" ? "updated" : p.action === "merge" ? "merged" : "conflicts"]++;
      if (level3()) {
        const tr = await importTranscripts(
          t.access,
          db,
          c.user_id,
          data.calendar.items.filter((e) => e.online && new Date(e.start).getTime() < Date.now()).map((e) => ({ subject: e.subject, start: e.start, joinUrl: e.joinUrl })),
        );
        report.transcripts += tr.added;
      }
      await db.from("connections").update({ last_sync: new Date().toISOString(), last_error: null }).eq("id", c.id);
      report.users++;
    } catch (err) {
      report.errors++;
      await db.from("connections").update({ last_error: err instanceof Error ? err.message.slice(0, 200) : "Sync failed" }).eq("id", c.id);
    }
  }
  return NextResponse.json(report);
}

export const GET = run;
export const POST = run;
