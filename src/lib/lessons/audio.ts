"use client";

/**
 * Turns a lesson recording (video or audio) into ~2-minute WAV pieces for Whisper.
 * Runs in the browser, so the full recording never has to be uploaded anywhere:
 * only the sound, in small pieces, goes to the speech model.
 */

export const RATE = 16000; // Whisper listens at 16 kHz mono.
const PIECE_S = 110; // ~3.5 MB of WAV, under the 4.5 MB request limit.
const SEARCH_S = 8; // look this far back for a quiet moment to cut at.

/** Decodes any format the browser can play (MP4, MOV, M4A, MP3, WAV, WebM) to 16 kHz mono. */
export async function decodeMono16k(file: Blob): Promise<Float32Array> {
  const buf = await file.arrayBuffer();
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  let audio: AudioBuffer;
  try {
    // Most browsers resample to the context's rate while decoding.
    const ctx = new Ctx({ sampleRate: RATE });
    audio = await ctx.decodeAudioData(buf);
    void ctx.close();
  } catch {
    const ctx = new Ctx();
    audio = await ctx.decodeAudioData(buf);
    void ctx.close();
  }
  if (audio.sampleRate === RATE && audio.numberOfChannels === 1) return audio.getChannelData(0);
  // Mix down and resample with an offline context.
  const length = Math.ceil(audio.duration * RATE);
  const off = new OfflineAudioContext(1, length, RATE);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

/** Where to cut: the quietest 50 ms within the last few seconds before each target. */
export function cutPoints(samples: Float32Array, rate = RATE, pieceS = PIECE_S): number[] {
  const cuts = [0];
  const frame = Math.round(rate * 0.05);
  let pos = 0;
  while (samples.length - pos > rate * (pieceS + 15)) {
    const target = pos + rate * pieceS;
    let best = target;
    let bestE = Infinity;
    for (let i = target - rate * SEARCH_S; i < target; i += frame) {
      let e = 0;
      for (let j = i; j < i + frame; j++) e += samples[j] * samples[j];
      if (e < bestE) {
        bestE = e;
        best = i + Math.floor(frame / 2);
      }
    }
    cuts.push(best);
    pos = best;
  }
  return cuts;
}

/** 16-bit PCM WAV. */
export function toWav(samples: Float32Array, rate = RATE): Blob {
  const data = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  data.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true); // PCM
  data.setUint16(22, 1, true); // mono
  data.setUint32(24, rate, true);
  data.setUint32(28, rate * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  str(36, "data");
  data.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    data.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([data], { type: "audio/wav" });
}

/** True when the piece is basically silence (skip it: Whisper invents words in silence). */
export function isSilent(samples: Float32Array): boolean {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 16) peak = Math.max(peak, Math.abs(samples[i]));
  return peak < 0.01;
}

export interface Piece {
  offset: number; // seconds into the lesson
  start: number; // sample index
  end: number;
}

/** Where each piece starts and ends; the WAV for a piece is made only when it is sent. */
export function piecesOf(samples: Float32Array, rate = RATE): Piece[] {
  const cuts = cutPoints(samples, rate);
  const out: Piece[] = [];
  cuts.forEach((start, i) => {
    const end = cuts[i + 1] ?? samples.length;
    const part = samples.subarray(start, end);
    if (part.length > rate * 0.5 && !isSilent(part)) out.push({ offset: start / rate, start, end });
  });
  return out;
}
