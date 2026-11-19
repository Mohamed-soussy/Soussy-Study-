import { NextResponse } from "next/server";
import { msConfig, msMissing } from "@/lib/school/microsoft";

export const runtime = "nodejs";

/** GET /api/microsoft/status — is "Connect Microsoft" set up on this server? (No secrets returned.) */
export function GET() {
  return NextResponse.json({ configured: msConfig().configured, missing: msMissing() });
}
