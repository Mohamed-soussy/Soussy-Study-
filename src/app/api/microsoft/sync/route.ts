import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { accessToken, graph, graphAll, GraphError, htmlToText, msConfig } from "@/lib/school/microsoft";

export const runtime = "nodejs";
export const maxDuration = 60;

type Part<T> = { status: "ok" | "off" | "needs_approval" | "error"; items: T[]; message?: string };

async function part<T>(on: boolean | undefined, run: () => Promise<T[]>): Promise<Part<T>> {
  if (on === false) return { status: "off", items: [] };
  try {
    return { status: "ok", items: await run() };
  } catch (err) {
    if (err instanceof GraphError && (err.status === 401 || err.status === 403)) return { status: "needs_approval", items: [], message: err.code };
    return { status: "error", items: [], message: err instanceof Error ? err.message.slice(0, 200) : "" };
  }
}

/**
 * POST /api/microsoft/sync — reads the student's Outlook calendar, Teams assignments and
 * OneDrive files (section 10, Level 2). Read-only. Body: { calendar?, assignments?, files? }
 * toggles. The browser turns the result into calendar items (one shared connector layer).
 */
export async function POST(req: NextRequest) {
  if (!msConfig().configured) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const want = (await req.json().catch(() => ({}))) as { calendar?: boolean; assignments?: boolean; files?: boolean };

  let token: string;
  try {
    const t = await accessToken(user.id);
    if (!t) return NextResponse.json({ error: "not_connected" }, { status: 404 });
    token = t.access;
  } catch {
    // Refresh token expired or revoked (password change, IT removed the app): sign in again.
    return NextResponse.json({ error: "reconnect", message: "Microsoft sign-in expired. Connect again." }, { status: 401 });
  }

  const from = new Date(Date.now() - 7 * 864e5).toISOString();
  const to = new Date(Date.now() + 60 * 864e5).toISOString();

  const [calendar, classes, files] = await Promise.all([
    part(want.calendar, async () => {
      const rows = await graphAll<{
        id: string;
        subject: string;
        start: { dateTime: string };
        end: { dateTime: string };
        isAllDay: boolean;
        isCancelled: boolean;
        location?: { displayName?: string };
        webLink?: string;
        isOnlineMeeting?: boolean;
        bodyPreview?: string;
      }>(
        token,
        `/me/calendarView?startDateTime=${from}&endDateTime=${to}&$select=id,subject,start,end,isAllDay,isCancelled,location,webLink,isOnlineMeeting,bodyPreview&$top=200&$orderby=start/dateTime`,
        { Prefer: 'outlook.timezone="UTC"' },
      );
      return rows
        .filter((r) => !r.isCancelled)
        .map((r) => ({
          id: r.id,
          subject: r.subject ?? "",
          start: `${r.start.dateTime.slice(0, 19)}Z`,
          end: `${r.end.dateTime.slice(0, 19)}Z`,
          allDay: r.isAllDay,
          location: r.location?.displayName ?? "",
          webLink: r.webLink ?? "",
          online: Boolean(r.isOnlineMeeting),
          preview: (r.bodyPreview ?? "").slice(0, 300),
        }));
    }),
    part(want.assignments, () => graphAll<{ id: string; displayName: string }>(token, "/education/me/classes?$select=id,displayName", {}, 2)),
    part(want.files, async () => {
      const rows = await graph<{ value: { id: string; name: string; size?: number; webUrl: string; lastModifiedDateTime: string; file?: { mimeType?: string }; folder?: unknown }[] }>(
        token,
        "/me/drive/recent?$top=30",
      ).catch(() => graph<{ value: { id: string; name: string; size?: number; webUrl: string; lastModifiedDateTime: string; file?: { mimeType?: string }; folder?: unknown }[] }>(token, "/me/drive/root/children?$top=50"));
      return rows.value
        .filter((f) => f.file)
        .map((f) => ({ id: f.id, name: f.name, size: f.size ?? 0, webUrl: f.webUrl, modified: f.lastModifiedDateTime, mime: f.file?.mimeType ?? "" }));
    }),
  ]);

  const className = new Map(classes.items.map((c) => [c.id, c.displayName]));
  const assignments: Part<{ id: string; title: string; due: string | null; classId: string; className: string; instructions: string; webUrl: string; submitted: boolean }> =
    classes.status !== "ok"
      ? { status: classes.status, items: [], message: classes.message }
      : await part(true, async () => {
          const rows = await graphAll<{
            id: string;
            displayName: string;
            dueDateTime: string | null;
            classId: string;
            status: string;
            webUrl?: string;
            instructions?: { content?: string };
            submissions?: { status?: string }[];
          }>(token, "/education/me/assignments?$expand=submissions&$top=100", {}, 3);
          return rows
            .filter((a) => a.status !== "draft" && (!a.dueDateTime || new Date(a.dueDateTime).getTime() > Date.now() - 30 * 864e5))
            .map((a) => ({
              id: a.id,
              title: a.displayName,
              due: a.dueDateTime,
              classId: a.classId,
              className: className.get(a.classId) ?? "",
              instructions: htmlToText(a.instructions?.content ?? "").slice(0, 1500),
              webUrl: a.webUrl ?? "",
              submitted: (a.submissions ?? []).some((s) => ["submitted", "returned", "reassigned"].includes(s.status ?? "")),
            }));
        });

  return NextResponse.json({ calendar, assignments, files, classes: classes.items.map((c) => ({ id: c.id, name: c.displayName })) });
}
