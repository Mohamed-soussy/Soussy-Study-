"use client";

/**
 * The room camera (sections 12A.4–12A.5). Everything here runs on the student's own device:
 *  - the microphone is never requested;
 *  - every frame is checked BEFORE anything is sent: an open-source nudity classifier
 *    (NSFW.js) and an object detector for knives (MediaPipe EfficientDet);
 *  - background blur is on by default: the face stays sharp, everything else is blurred;
 *  - only a small snapshot (192×144) leaves the device, every 10 seconds.
 */

export type View = "blur" | "desk" | "plain";

export interface Check {
  unsafe: boolean;
  reason: "nudity" | "weapons" | null;
}

type Nsfw = { classify(img: HTMLCanvasElement | HTMLVideoElement, top?: number): Promise<{ className: string; probability: number }[]> };

let nsfwModel: Promise<Nsfw> | null = null;
function loadNsfw(): Promise<Nsfw> {
  nsfwModel ??= (async () => {
    const tf = await import("@tensorflow/tfjs");
    await tf.ready();
    tf.enableProdMode();
    // The model is served from our own site (public/nsfw), loaded only when a room opens.
    const nsfw = await import("nsfwjs/core");
    return (await nsfw.load("/nsfw/", { size: 224 })) as unknown as Nsfw;
  })();
  return nsfwModel;
}

type VisionModels = { face: import("@mediapipe/tasks-vision").FaceLandmarker; objects: import("@mediapipe/tasks-vision").ObjectDetector };
let visionModels: Promise<VisionModels> | null = null;
function loadVision() {
  visionModels ??= (async () => {
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const make = async (delegate: "GPU" | "CPU") => ({
      face: await vision.FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: "/mediapipe/models/face_landmarker.task", delegate }, runningMode: "IMAGE", numFaces: 1 }),
      objects: await vision.ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/mediapipe/models/efficientdet_lite0.tflite", delegate },
        runningMode: "IMAGE",
        scoreThreshold: 0.55,
        maxResults: 3,
        categoryAllowlist: ["knife"],
      }),
    });
    try {
      return await make("GPU");
    } catch {
      return await make("CPU");
    }
  })();
  return visionModels;
}

/** Loads the safety models up front, so the first snapshot isn't delayed. */
export async function prepareSafety() {
  await Promise.all([loadNsfw(), loadVision()]);
}

/** Camera only. The browser never asks for the microphone. */
export async function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" } });
}

const W = 192;
const H = 144;

/**
 * Checks the current frame on this device, then (only if it's safe) returns a small
 * snapshot to share. If anything is flagged, nothing is returned.
 */
export async function takeSnapshot(video: HTMLVideoElement, view: View): Promise<{ check: Check; image: string | null }> {
  if (!video.videoWidth) return { check: { unsafe: false, reason: null }, image: null };
  const full = document.createElement("canvas");
  full.width = 320;
  full.height = Math.round((320 * video.videoHeight) / video.videoWidth);
  const fctx = full.getContext("2d")!;
  fctx.drawImage(video, 0, 0, full.width, full.height);

  const [nsfw, vision] = await Promise.all([loadNsfw(), loadVision()]);
  const preds = await nsfw.classify(full, 5);
  const p = (name: string) => preds.find((x) => x.className === name)?.probability ?? 0;
  if (p("Porn") > 0.5 || p("Hentai") > 0.6 || p("Sexy") > 0.8) return { check: { unsafe: true, reason: "nudity" }, image: null };
  if (vision.objects.detect(full).detections.length) return { check: { unsafe: true, reason: "weapons" }, image: null };

  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d")!;
  if (view === "blur") {
    ctx.filter = "blur(7px)";
    ctx.drawImage(full, 0, 0, W, H);
    ctx.filter = "none";
    const lm = vision.face.detect(full).faceLandmarks[0];
    if (lm) {
      // Sharp oval around the face; no face found → everything stays blurred.
      const xs = lm.map((l: { x: number }) => l.x);
      const ys = lm.map((l: { y: number }) => l.y);
      const cx = ((Math.min(...xs) + Math.max(...xs)) / 2) * W;
      const cy = ((Math.min(...ys) + Math.max(...ys)) / 2) * H;
      const rx = ((Math.max(...xs) - Math.min(...xs)) / 2) * W * 1.45;
      const ry = ((Math.max(...ys) - Math.min(...ys)) / 2) * H * 1.6;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(full, 0, 0, W, H);
      ctx.restore();
    }
  } else {
    ctx.drawImage(full, 0, 0, W, H);
  }
  return { check: { unsafe: false, reason: null }, image: out.toDataURL("image/jpeg", 0.6) };
}
