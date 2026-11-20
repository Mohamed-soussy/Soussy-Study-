import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseVtt } from "@/lib/lessons/vtt";
import { graph, graphAll, GraphError, htmlToText } from "./microsoft";

/**
 * Reads a student's Outlook calendar, Teams assignments, OneDrive files and (Level 3, once
 * the school approves) class meeting transcripts. Used by the Sync button and the 30-minute
 * background job. Read-only.
 */

type Part<T> = { status: "ok" | "off" | "needs_approval" | "error"; items: T[]; message?: string };

export async function part<T>(on: boolean | undefined, run: () => Promise<T[]>): Promise<Part<T>> {
  if (on === false) return { status: "off", items: [] };
  try {
    return { status: "ok", items: await run() };
  } catch (err) {
    if (err instanceof GraphError && (err.status === 401 || err.status === 403)) return { status: "needs_approval", items: [], message: err.code };
    return { status: "error", items: [], message: err instanceof Error ? err.message.slice(0, 200) : "" };
  }
}

export interface Want {
  calendar?: boolean;
  assignments?: boolean;
  files?: boolean;
}

export async function fetchMicrosoft(token: string, want: Want) {
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
        onlineMeeting?: { joinUrl?: string } | null;
        bodyPreview?: string;
      }>(
        token,
        `/me/calendarView?startDateTime=${from}&endDateTime=${to}&$select=id,subject,start,end,isAllDay,isCancelled,location,webLink,isOnlineMeeting,onlineMeeting,bodyPreview&$top=200&$orderby=start/dateTime`,
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
          joinUrl: r.onlineMeeting?.joinUrl ?? undefined,
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

  return { calendar, assignments, files, classes: classes.items.map((c) => ({ id: c.id, name: c.displayName })) };
}

/** Level 3 switches on transcripts; the school's IT must approve these permissions. */
export const level3 = () => process.env.MS_LEVEL3 === "1";
export const LEVEL3_SCOPES = ["OnlineMeetings.Read", "OnlineMeetingTranscript.Read.All"];

/**
 * Level 3: transcripts of the student's recent class meetings become Lessons, ready to
 * analyze (section 11.1). Returns how many were added, or why none could be.
 */
export async function importTranscripts(
  token: string,
  db: SupabaseClient,
  userId: string,
  meetings: { subject: string; start: string; joinUrl?: string }[],
): Promise<{ added: number; blocked?: string }> {
  let added = 0;
  for (const m of meetings.filter((x) => x.joinUrl).slice(0, 15)) {
    try {
      const found = await graph<{ value: { id: string }[] }>(token, `/me/onlineMeetings?$filter=JoinWebUrl eq '${encodeURIComponent(m.joinUrl!)}'`);
      const meetingId = found.value[0]?.id;
      if (!meetingId) continue;
      const list = await graph<{ value: { id: string; createdDateTime: string }[] }>(token, `/me/onlineMeetings/${meetingId}/transcripts`);
      for (const tr of list.value) {
        const ext = `ms:transcript:${tr.id}`.slice(0, 300);
        const { data: have } = await db.from("lessons").select("id").eq("user_id", userId).eq("external_id", ext).maybeSingle();
        if (have) continue;
        const res = await fetch(`https://graph.microsoft.com/v1.0/me/onlineMeetings/${meetingId}/transcripts/${tr.id}/content?$format=text/vtt`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) continue;
        const lines = parseVtt(await res.text());
        if (!lines.length) continue;
        await db.from("lessons").insert({
          user_id: userId,
          title: (m.subject || "Class meeting").slice(0, 200),
          lesson_date: m.start.slice(0, 10),
          media_name: "Teams transcript",
          media_kind: "transcript",
          duration_s: Math.round(lines[lines.length - 1].e),
          status: "processing", // waits for the student to open it; the analyzer runs in their browser
          transcript: lines,
          external_id: ext,
        });
        added++;
      }
    } catch (err) {
      // The tenant admin can switch off transcript access for apps (section 10.2).
      if (err instanceof GraphError && (err.code === "GraphAccessToTranscriptsDisabled" || err.status === 403)) {
        return { added, blocked: "Your school has turned off app access to meeting transcripts. Upload the transcript from Teams instead (Lessons → Add a lesson)." };
      }
    }
  }
  return { added };
}
