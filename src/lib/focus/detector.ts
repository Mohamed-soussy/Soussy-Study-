"use client";

import type { Signals } from "./rules";

/**
 * On-device camera checks with MediaPipe (section 12A.2). The models and runtime
 * are served from our own site (/mediapipe), run inside the browser, and each
 * frame is analysed and dropped: nothing is stored or uploaded.
 */
export interface Detector {
  detect(video: HTMLVideoElement): Signals;
  close(): void;
}

export async function createDetector(): Promise<Detector> {
  const vision = await import("@mediapipe/tasks-vision");
  const fileset = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");

  const make = async (delegate: "GPU" | "CPU") => {
    const face = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/mediapipe/models/face_landmarker.task", delegate },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
    const objects = await vision.ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/mediapipe/models/efficientdet_lite0.tflite", delegate },
      runningMode: "VIDEO",
      scoreThreshold: 0.3,
      maxResults: 3,
      categoryAllowlist: ["cell phone"],
    });
    return { face, objects };
  };

  let models: Awaited<ReturnType<typeof make>>;
  try {
    models = await make("GPU");
  } catch {
    models = await make("CPU"); // older laptops and some phones
  }

  let last = 0;
  return {
    detect(video) {
      // MediaPipe needs strictly increasing timestamps.
      const ts = Math.max(performance.now(), last + 1);
      last = ts;
      const f = models.face.detectForVideo(video, ts);
      const o = models.objects.detectForVideo(video, ts);
      const has = f.faceLandmarks.length > 0;
      const shapes = new Map((f.faceBlendshapes[0]?.categories ?? []).map((c) => [c.categoryName, c.score]));
      const blink = ((shapes.get("eyeBlinkLeft") ?? 0) + (shapes.get("eyeBlinkRight") ?? 0)) / 2;
      // Head turn (yaw) from the face transform matrix (column-major 4×4).
      const m = f.facialTransformationMatrixes?.[0]?.data;
      const yaw = m ? Math.abs((Math.atan2(m[8], m[10]) * 180) / Math.PI) : 0;
      const pitch = m ? (Math.atan2(-m[9], Math.hypot(m[8], m[10])) * 180) / Math.PI : 0;
      // Eye direction: when looking left, the left eye looks "out" and the right eye looks "in".
      const b = (k: string) => shapes.get(k) ?? 0;
      const left = (b("eyeLookOutLeft") + b("eyeLookInRight")) / 2;
      const right = (b("eyeLookInLeft") + b("eyeLookOutRight")) / 2;
      const up = (b("eyeLookUpLeft") + b("eyeLookUpRight")) / 2;
      const down = (b("eyeLookDownLeft") + b("eyeLookDownRight")) / 2;
      const gaze: Signals["gaze"] =
        !has ? "screen" : left > 0.5 ? "left" : right > 0.5 ? "right" : up > 0.45 || pitch > 22 ? "up" : down > 0.6 || pitch < -28 ? "down" : "screen";
      return {
        face: has,
        yaw: has ? yaw : 0,
        eyesClosed: has && blink > 0.55,
        yawn: has && (shapes.get("jawOpen") ?? 0) > 0.6,
        phone: o.detections.length > 0,
        gaze,
      };
    },
    close() {
      models.face.close();
      models.objects.close();
    },
  };
}

/** A small, low-quality JPEG for opt-in cloud checks (≈5–10 KB, few tokens). */
export function snapshot(video: HTMLVideoElement): string | null {
  if (!video.videoWidth) return null;
  const w = 256;
  const h = Math.round((video.videoHeight / video.videoWidth) * w);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(video, 0, 0, w, h);
  const url = c.toDataURL("image/jpeg", 0.5);
  return url.slice(url.indexOf(",") + 1);
}
