"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { SessionState } from "@/lib/session/store";

/**
 * Real-time link between a student's own devices (section 4A).
 * - Signed in: Supabase Realtime, on the PRIVATE channel "user:<id>". The database policy
 *   (0004_phase3.sql) lets only devices signed in to that same account listen or send.
 * - Demo mode: BroadcastChannel between tabs of this browser, so it can be tried locally.
 */

export type DeviceRole = "everything" | "remote" | "flashcards" | "chat" | "camera" | "scanner" | "whiteboard";

export type SyncMessage =
  | { type: "session"; state: SessionState }
  | { type: "send"; url: string; title: string; from: string; fromName: string; to?: string }
  | { type: "remote"; action: "pause" | "resume" | "next" | "break" | "emergency"; from: string }
  | { type: "scan"; fileId: string; name: string; from: string; fromName: string }
  | { type: "role"; deviceId: string; role: DeviceRole }
  | { type: "audio"; deviceId: string }
  | { type: "linked"; deviceId: string; by: string }
  | { type: "hello"; from: string };

type Handler = (m: SyncMessage) => void;

export interface Transport {
  send(m: SyncMessage): void;
  /** Ids of this account's devices that are online now. */
  online(): string[];
  close(): void;
}

let transport: Transport | null = null;
const handlers = new Set<Handler>();
const presence = new Set<() => void>();

export function onMessage(h: Handler): () => void {
  handlers.add(h);
  return () => void handlers.delete(h);
}
export function onPresence(h: () => void): () => void {
  presence.add(h);
  return () => void presence.delete(h);
}
export function sync(): Transport | null {
  return transport;
}

const deliver = (m: SyncMessage) => handlers.forEach((h) => h(m));

export async function connect(myId: string, myName: string): Promise<Transport> {
  if (transport) return transport;
  const sb = getSupabaseBrowser();

  if (!sb) {
    const bc = new BroadcastChannel("soussy-demo-devices");
    bc.onmessage = (e) => deliver(e.data as SyncMessage);
    transport = { send: (m) => bc.postMessage(m), online: () => [], close: () => bc.close() };
    return transport;
  }

  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error("not-signed-in");
  await sb.realtime.setAuth(); // private channels need the student's token
  const channel: RealtimeChannel = sb.channel(`user:${data.user.id}`, {
    config: { private: true, broadcast: { self: false }, presence: { key: myId } },
  });
  let online: string[] = [];
  channel
    .on("broadcast", { event: "msg" }, ({ payload }) => deliver(payload as SyncMessage))
    .on("presence", { event: "sync" }, () => {
      online = Object.keys(channel.presenceState());
      presence.forEach((p) => p());
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") await channel.track({ name: myName, at: Date.now() });
    });
  transport = {
    send: (m) => void channel.send({ type: "broadcast", event: "msg", payload: m }),
    online: () => online,
    close: () => void sb.removeChannel(channel),
  };
  return transport;
}

/** A readable name for this device ("iPhone", "Windows laptop", …). */
export function guessDeviceName(): string {
  if (typeof navigator === "undefined") return "Device";
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows laptop";
  if (/CrOS/.test(ua)) return "Chromebook";
  return "Computer";
}
