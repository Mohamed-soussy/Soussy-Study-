"use client";

/**
 * Live video for study rooms, free: peer to peer (WebRTC). Video goes straight between
 * the students' devices; the room channel only carries the set-up messages. Fine for small
 * rooms (up to ~6). Cameras only, no microphones (silent study, like a library).
 */
export type RtcMessage = { type: "rtc"; from: string; to?: string; kind: "hello" | "offer" | "answer" | "ice"; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

const STUN: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];

/** Free STUN, plus a TURN relay if the site owner set one up (needed on strict school Wi-Fi). */
export async function iceServers(): Promise<RTCIceServer[]> {
  try {
    const r = await fetch("/api/rooms/turn", { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { iceServers?: RTCIceServer[] };
      if (j.iceServers?.length) return [...STUN, ...j.iceServers];
    }
  } catch {
    /* STUN only */
  }
  return STUN;
}

export class Mesh {
  private peers = new Map<string, RTCPeerConnection>();
  private pending = new Map<string, RTCIceCandidateInit[]>();
  constructor(
    private me: string,
    private stream: MediaStream,
    private servers: RTCIceServer[],
    private send: (m: RtcMessage) => void,
    private onStream: (id: string, stream: MediaStream | null) => void,
    private max = 6,
  ) {}

  /** Say hello so everyone already here connects to us. */
  hello() {
    this.send({ type: "rtc", from: this.me, kind: "hello" });
  }

  private create(id: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.servers });
    this.peers.set(id, pc);
    this.stream.getTracks().forEach((t) => pc.addTrack(t, this.stream));
    pc.onicecandidate = (e) => e.candidate && this.send({ type: "rtc", from: this.me, to: id, kind: "ice", candidate: e.candidate.toJSON() });
    pc.ontrack = (e) => this.onStream(id, e.streams[0] ?? new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") this.drop(id);
    };
    return pc;
  }

  private async offer(id: string) {
    if (this.peers.has(id) || this.peers.size >= this.max) return;
    const pc = this.create(id);
    await pc.setLocalDescription(await pc.createOffer());
    this.send({ type: "rtc", from: this.me, to: id, kind: "offer", sdp: pc.localDescription!.toJSON() });
  }

  async handle(m: RtcMessage) {
    if (m.from === this.me || (m.to && m.to !== this.me)) return;
    try {
      if (m.kind === "hello") {
        // The smaller id makes the offer, so two people never offer to each other at once.
        if (this.me < m.from) await this.offer(m.from);
        else if (!this.peers.has(m.from) && !m.to) this.send({ type: "rtc", from: this.me, to: m.from, kind: "hello" });
      } else if (m.kind === "offer" && m.sdp) {
        if (this.peers.size >= this.max && !this.peers.has(m.from)) return;
        const pc = this.peers.get(m.from) ?? this.create(m.from);
        await pc.setRemoteDescription(m.sdp);
        await pc.setLocalDescription(await pc.createAnswer());
        this.send({ type: "rtc", from: this.me, to: m.from, kind: "answer", sdp: pc.localDescription!.toJSON() });
        await this.flush(m.from);
      } else if (m.kind === "answer" && m.sdp) {
        const pc = this.peers.get(m.from);
        if (pc && pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(m.sdp);
          await this.flush(m.from);
        }
      } else if (m.kind === "ice" && m.candidate) {
        const pc = this.peers.get(m.from);
        if (pc?.remoteDescription) await pc.addIceCandidate(m.candidate);
        else this.pending.set(m.from, [...(this.pending.get(m.from) ?? []), m.candidate]);
      }
    } catch {
      /* a broken handshake just means no video from that person; their snapshot still shows */
    }
  }

  private async flush(id: string) {
    const pc = this.peers.get(id);
    for (const c of this.pending.get(id) ?? []) await pc?.addIceCandidate(c).catch(() => {});
    this.pending.delete(id);
  }

  drop(id: string) {
    this.peers.get(id)?.close();
    this.peers.delete(id);
    this.pending.delete(id);
    this.onStream(id, null);
  }

  close() {
    for (const id of [...this.peers.keys()]) this.drop(id);
  }
}
