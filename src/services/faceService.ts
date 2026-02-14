// src/services/faceService.ts

import {
  pauseListening,
  resumeListening,
} from "@/lib/govind/voiceStateController";

/**
 * FACE CAPTURE SERVICE
 *
 * HARD GUARANTEES:
 * - Voice input is ALWAYS paused during capture
 * - Voice is ALWAYS resumed exactly once
 * - Camera is ALWAYS released
 * - Safe against multiple concurrent calls
 *
 * ❌ No state transitions
 * ❌ No Firebase logic
 * ❌ No UI logic
 */
export const captureFaceImage = async (): Promise<{
  success: boolean;
  file?: File;
  error?: string;
}> => {
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let pauseApplied = false;

  try {
    console.log("[FACE] Pausing voice input");
    pauseListening("FACE_CAPTURE");
    pauseApplied = true;

    console.log("[FACE] Requesting camera access");
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
    });

    // Hidden video element
    video = document.createElement("video");
    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;

    await video.play();

    // Allow camera to stabilize
    await new Promise((res) => setTimeout(res, 800));

    // Canvas snapshot
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas context unavailable");
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas → Blob → File
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.95)
    );

    if (!blob) {
      throw new Error("Failed to capture image");
    }

    const file = new File([blob], "face.jpg", {
      type: "image/jpeg",
    });

    console.log("[FACE] Face image captured successfully");

    return {
      success: true,
      file,
    };
  } catch (err: any) {
    console.error("[FACE] Face capture failed:", err);

    return {
      success: false,
      error: err?.message || "Face capture failed",
    };
  } finally {
    /* ================= CLEANUP (NON-NEGOTIABLE) ================= */

    try {
      stream?.getTracks().forEach((track) => track.stop());
    } catch {}

    try {
      if (video) {
        video.pause();
        video.srcObject = null;
      }
    } catch {}

    if (pauseApplied) {
      console.log("[FACE] Resuming voice input");
      resumeListening("FACE_CAPTURE");
    }
  }
};
