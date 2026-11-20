"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";

/** What a tile shows (section 12A.4): nickname, grade, subject, unit, timer ring, streak. */
export interface Tile {
  id: string;
  nick: string;
  grade: string;
  subject: string;
  unit: string;
  ring: number; // 0–1
  minutesLeft: number | null;
  streak: number;
  image: string | null;
  at: number;
}

export type RoomMessage =
  | { type: "snap"; tile: Tile }
  | { type: "react"; from: string; fromNick: string; to: string; emoji?: string; preset?: string }
  | { type: "leave"; id: string };

export interface RoomLink {
  send(m: RoomMessage): void;
  count(): number;
  close(): void;
}

export const ROOM_LIMIT = 9;

/**
 * Joins a room's channel. Accounts: a private Supabase broadcast channel the database only
 * lets eligible students into (age band, school, no ban). Demo mode: this browser's tabs.
 */
export async function joinRoom(topic: string, myId: string, onMessage: (m: RoomMessage) => void, onCount: (n: number) => void): Promise<RoomLink> {
  const sb = getSupabaseBrowser();
  if (!sb) {
    const bc = new BroadcastChannel(`soussy-room-${topic}`);
    bc.onmessage = (e) => onMessage(e.data as RoomMessage);
    onCount(1);
    return { send: (m) => bc.postMessage(m), count: () => 1, close: () => bc.close() };
  }
  await sb.realtime.setAuth();
  const channel: RealtimeChannel = sb.channel(topic, { config: { private: true, broadcast: { self: false }, presence: { key: myId } } });
  let n = 0;
  await new Promise<void>((resolve, reject) => {
    channel
      .on("broadcast", { event: "room" }, ({ payload }) => onMessage(payload as RoomMessage))
      .on("presence", { event: "sync" }, () => {
        n = Object.keys(channel.presenceState()).length;
        onCount(n);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ at: Date.now() });
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(status));
      });
  });
  return { send: (m) => void channel.send({ type: "broadcast", event: "room", payload: m }), count: () => n, close: () => void sb.removeChannel(channel) };
}
