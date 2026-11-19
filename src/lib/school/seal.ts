import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for Microsoft sign-in tokens (section 10.2: "store tokens encrypted on the
 * server only"). The key is TOKEN_ENCRYPTION_KEY (32 random bytes, base64), or, if that
 * isn't set, derived from the Supabase service role key, which is also server-only.
 */
function key(): Buffer {
  const explicit = process.env.TOKEN_ENCRYPTION_KEY;
  if (explicit) {
    const k = Buffer.from(explicit, "base64");
    if (k.length === 32) return k;
  }
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!fallback) throw new Error("Set TOKEN_ENCRYPTION_KEY (or SUPABASE_SERVICE_ROLE_KEY) on the server.");
  return createHash("sha256").update(`soussy-study:tokens:${fallback}`).digest();
}

export function sealingConfigured() {
  return Boolean(process.env.TOKEN_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}

export function unseal<T>(sealed: string): T {
  const raw = Buffer.from(sealed, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8")) as T;
}
