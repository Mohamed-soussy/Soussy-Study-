import type { Metadata } from "next";
import { Brand } from "@/components/brand/logo";
import { ASSIGNMENT_SCOPES, BASE_SCOPES } from "@/lib/school/microsoft";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "For school IT" };
export const dynamic = "force-dynamic";

const WHY: Record<string, string> = {
  openid: "Sign the student in.",
  profile: "Show the student's name on the Connections card.",
  email: "Show which school account is connected.",
  offline_access: "Sync every 30 minutes without asking the student to sign in again.",
  "User.Read": "Read the signed-in student's own basic profile.",
  "Calendars.Read": "Show the student's class meetings and school events on their study calendar.",
  "Files.Read": "List the student's own OneDrive files so they can choose ones to study from.",
  "EduAssignments.ReadBasic": "Read the student's own Teams assignments and due dates (no grades, no feedback).",
};

/**
 * The one-page "For school IT" handout (section 10.2): what the app reads, which
 * permissions, that it never writes to Teams, data retention, and a contact.
 * Written in English for the school's IT department; prints on one page.
 */
export default function SchoolItPage() {
  const clientId = process.env.MS_CLIENT_ID || "(set when the app is registered)";
  const rows = [...BASE_SCOPES, ...ASSIGNMENT_SCOPES];
  return (
    <div dir="ltr" lang="en" className="mx-auto flex max-w-3xl flex-col gap-5 py-8 text-[15px] leading-6 ps-[max(16px,env(safe-area-inset-left))] pe-[max(16px,env(safe-area-inset-right))] print:max-w-none print:py-0 print:text-[11px] print:leading-[1.35]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Brand />
        <PrintButton label="Print or save as PDF" />
      </div>
      <header>
        <h1 className="text-2xl font-bold print:text-xl">Soussy Study: information for school IT</h1>
        <p className="mt-1 text-muted">
          A free study app built by a KiS student as an IB CAS project. Students can connect their school Microsoft account so their Teams assignments and class meetings appear on
          their study calendar. This page explains exactly what that connection does.
        </p>
      </header>

      <section>
        <h2 className="text-lg font-semibold print:text-sm">In one sentence</h2>
        <p>
          Soussy Study <strong>only reads</strong> what the signed-in student can already see, with delegated permissions. It <strong>never writes</strong> to Teams, Outlook or
          OneDrive, never posts as the student, and never reads other students&apos; data.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold print:text-sm">Permissions requested (Microsoft Graph, delegated)</h2>
        <table className="mt-2 w-full border-collapse text-start text-sm print:text-[11px]">
          <thead>
            <tr className="border-b border-border text-start">
              <th className="py-1 pe-3 text-start font-semibold">Permission</th>
              <th className="py-1 text-start font-semibold">Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s} className="border-b border-border align-top">
                <td className="py-1 pe-3 font-mono text-xs">{s}</td>
                <td className="py-1">
                  {WHY[s]}
                  {ASSIGNMENT_SCOPES.includes(s) && " Requested separately; works once the school allows it."}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-sm text-muted print:text-[11px]">
          Not requested: any write permission, mail, chats, channel messages, other users&apos; data, grades. Level 3, only with your approval, adds class meeting
          transcripts (OnlineMeetings.Read, OnlineMeetingTranscript.Read.All) so class recordings can be summarized for the student.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold print:text-sm">Where data goes</h2>
          <ul className="list-disc ps-5">
            <li>Sign-in tokens are encrypted (AES-256-GCM) and stored on the server only; the browser never sees them.</li>
            <li>Imported items are stored in the student&apos;s own account (Supabase, row-level security: each student can only read their own rows).</li>
            <li>AI features that touch a student&apos;s own content use Groq, whose API does not train on customer data. Lesson recordings stay on the student&apos;s device; only audio pieces are sent for transcription.</li>
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-semibold print:text-sm">Retention and control</h2>
          <ul className="list-disc ps-5">
            <li>The student can disconnect at any time in Settings → Connections. Disconnecting deletes the stored tokens immediately.</li>
            <li>On disconnect the student chooses whether to keep or delete what was imported.</li>
            <li>Deleting the Soussy Study account deletes everything.</li>
            <li>Sync runs every 30 minutes while the student has the app open. Only after you approve Level 3 does it also sync in the background every 30 minutes and import class meeting transcripts.</li>
          </ul>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold print:text-sm">How to approve it (Microsoft Entra admin center)</h2>
        <ol className="list-decimal ps-5">
          <li>Go to Enterprise applications and find the app with Application (client) ID <span className="font-mono text-xs">{clientId}</span>.</li>
          <li>Review the permissions above, then choose Permissions → Grant admin consent for the school.</li>
          <li>Optional: limit it to student accounts with Users and groups, and set &quot;Assignment required&quot;.</li>
        </ol>
      </section>

      <section className="rounded-[12px] border border-border p-4 print:p-2">
        <h2 className="text-lg font-semibold print:text-sm">Contact</h2>
        <p className="text-muted">Student: ______________________ &nbsp; Grade: ______ &nbsp; Email: ______________________</p>
        <p className="mt-1 text-muted">CAS coordinator / supervising teacher: ______________________</p>
      </section>
    </div>
  );
}
