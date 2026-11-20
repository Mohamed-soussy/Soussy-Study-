import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { Brand } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { admin } from "@/lib/school/microsoft";

export const metadata: Metadata = { title: "Guardian approval" };
export const dynamic = "force-dynamic";

async function load(token: string) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !/^[0-9a-f]{40,80}$/.test(token)) return null;
  const db = admin();
  const { data: req } = await db.from("guardian_requests").select("*").eq("token", token).maybeSingle();
  if (!req) return null;
  const { data: p } = await db.from("profiles").select("full_name,school").eq("id", req.user_id).maybeSingle();
  return { req, name: (p?.full_name as string | null)?.split(/\s+/)[0] ?? "Your child", school: (p?.school as string | null) ?? "" };
}

async function decide(token: string, approve: boolean) {
  "use server";
  const found = await load(token);
  if (!found || found.req.status !== "pending") return;
  const db = admin();
  await db.from("guardian_requests").update({ status: approve ? "approved" : "declined", decided_at: new Date().toISOString() }).eq("token", token);
  if (approve) await db.from("profiles").update({ rooms_guardian_ok: true }).eq("id", found.req.user_id);
  revalidatePath(`/guardian/${token}`);
}

/**
 * The page a guardian opens from the link their child shares (section 12A.5: under-18s need
 * guardian approval for live study rooms). Written in English for parents; one decision.
 */
export default async function GuardianPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await load(token);
  return (
    <div dir="ltr" lang="en" className="mx-auto flex max-w-2xl flex-col gap-5 py-10 ps-[max(16px,env(safe-area-inset-left))] pe-[max(16px,env(safe-area-inset-right))]">
      <Brand />
      {!found ? (
        <Card className="p-5">
          <h1 className="text-xl font-bold">This link isn&apos;t valid</h1>
          <p className="mt-2 text-muted">Ask your child to make a new approval link in Soussy Study → Study rooms.</p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4 p-5">
          <h1 className="text-2xl font-bold">{found.name} would like to join study rooms</h1>
          <p>
            Soussy Study is a study app made by a student at {found.school || "their school"} as an IB CAS project. Study rooms let students study &quot;together&quot; on camera to stay
            focused. Because cameras are involved, students under 18 need a parent or guardian to agree first.
          </p>
          <ul className="list-disc ps-5 text-sm">
            <li>Cameras only: microphones are never used, and there is no chat, no links and no private messages.</li>
            <li>Students only see nicknames, grade and subject, and a small picture that updates every 10 seconds, with the background blurred by default.</li>
            <li>Rooms are school-only or invite-only friend rooms, by age group (13–15, 16–17); adults are never matched with under-18s.</li>
            <li>Every picture is checked for unsafe content on the device before it is sent, and spot-checked by an AI moderation model. Pictures are not stored.</li>
            <li>Reports go to moderators; rule breaks lead to bans. Your child can leave at any time.</li>
          </ul>
          {found.req.status === "pending" ? (
            <div className="flex flex-wrap gap-3">
              <form action={decide.bind(null, token, true)}>
                <Button type="submit">I agree: allow study rooms</Button>
              </form>
              <form action={decide.bind(null, token, false)}>
                <Button type="submit" variant="outline">
                  Don&apos;t allow
                </Button>
              </form>
            </div>
          ) : (
            <p className="rounded-[10px] bg-surface-2 p-3 font-medium">
              {found.req.status === "approved" ? "Thank you. Study rooms are now allowed." : "Study rooms stay off. You can change your mind with a new link."}
            </p>
          )}
          <p className="text-xs text-muted">
            Questions? Contact the student or their school. This link only allows study rooms; it does not give access to your child&apos;s account.
          </p>
        </Card>
      )}
    </div>
  );
}
