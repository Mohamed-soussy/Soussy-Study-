"use client";

/**
 * Finds the moments a lesson video's picture changes (a new slide, a filled whiteboard)
 * and grabs one image of each, so the text on screen can be read and pinned to its time
 * in the transcript (section 11.2). Runs in the browser; nothing is uploaded here.
 */

const STEP_S = 10; // look at one frame every 10 seconds
const MAX_SLIDES = 12;

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = t;
    setTimeout(done, 3000); // some files never fire "seeked" for the last frame
  });
}

export interface Frame {
  at: number;
  /** JPEG data URL, about 960 px wide. */
  image: string;
  /** How different it was from the frame kept before it (0–1). */
  change: number;
}

export async function sampleSlides(file: Blob, onProgress?: (done: number) => void): Promise<Frame[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("video"));
      setTimeout(() => reject(new Error("timeout")), 15000);
    });
    if (!video.videoWidth) return [];
    const small = document.createElement("canvas");
    small.width = 32;
    small.height = 18;
    const sctx = small.getContext("2d", { willReadFrequently: true })!;
    const big = document.createElement("canvas");
    const scale = Math.min(1, 960 / video.videoWidth);
    big.width = Math.round(video.videoWidth * scale);
    big.height = Math.round(video.videoHeight * scale);
    const bctx = big.getContext("2d")!;

    let last: Uint8ClampedArray | null = null;
    const kept: Frame[] = [];
    const steps = Math.floor(video.duration / STEP_S);
    for (let n = 0; n <= steps; n++) {
      const t = Math.min(video.duration - 0.1, n * STEP_S + 1);
      await seek(video, t);
      sctx.drawImage(video, 0, 0, 32, 18);
      const px = sctx.getImageData(0, 0, 32, 18).data;
      let diff = 0;
      if (last) for (let i = 0; i < px.length; i += 4) diff += Math.abs(px[i] - last[i]) + Math.abs(px[i + 1] - last[i + 1]) + Math.abs(px[i + 2] - last[i + 2]);
      const change = last ? diff / (32 * 18 * 3 * 255) : 1;
      // A new slide changes a large part of the picture; a moving teacher changes a little.
      if (change > 0.12) {
        bctx.drawImage(video, 0, 0, big.width, big.height);
        kept.push({ at: Math.round(t), image: big.toDataURL("image/jpeg", 0.72), change });
        last = px;
      }
      onProgress?.(n / Math.max(1, steps));
    }
    if (kept.length <= MAX_SLIDES) return kept;
    // Too many: keep the biggest changes, in time order.
    return [...kept].sort((a, b) => b.change - a.change).slice(0, MAX_SLIDES).sort((a, b) => a.at - b.at);
  } catch {
    return [];
  } finally {
    URL.revokeObjectURL(url);
  }
}
