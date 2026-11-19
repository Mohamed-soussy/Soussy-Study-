import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetches a URL a student typed (a calendar feed) without letting it reach the server's own
 * network: https only, public addresses only (checked again after every redirect), small
 * responses, short time limit.
 */

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? privateAddress(mapped[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

export class FetchRefused extends Error {}

async function checkHost(url: URL) {
  if (url.protocol !== "https:") throw new FetchRefused("Only https links can be imported.");
  if (url.username || url.password) throw new FetchRefused("Links with a password in them can't be imported.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new FetchRefused("That address isn't on the public internet.");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  // Behind an outbound proxy the name may not resolve here; the proxy then decides.
  if (ips.some(privateAddress)) throw new FetchRefused("That address isn't on the public internet.");
}

export async function safeFetchText(raw: string, maxBytes = 3 * 1024 * 1024): Promise<string> {
  let url = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  for (let hop = 0; hop < 4; hop++) {
    await checkHost(url);
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000), headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new FetchRefused(`The calendar link answered with an error (${res.status}).`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > maxBytes) throw new FetchRefused("That calendar is too big to import.");
    const reader = res.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new FetchRefused("That calendar is too big to import.");
      }
      chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }
  throw new FetchRefused("Too many redirects.");
}
