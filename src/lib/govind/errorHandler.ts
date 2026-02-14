// src/lib/govind/errorHandler.ts

import { speakText } from "@/services/ttsService";

/**
 * GLOBAL FATAL ERROR HANDLER
 *
 * HARD GUARANTEES:
 * - NEVER throws
 * - NEVER mutates state
 * - NEVER controls mic directly
 * - NEVER loops or spams TTS
 *
 * RESPONSIBILITY:
 * - Log fatal error
 * - Speak error message exactly once per incident
 *
 * NOTE:
 * - This handler is STATE-AGNOSTIC by design
 * - Fatal errors ALWAYS speak
 */

let handlingFatalError = false;

export const handleFatalError = async (message: string): Promise<void> => {
  // 🔒 Prevent concurrent fatal error handling
  if (handlingFatalError) {
    console.warn("[FATAL ERROR] Already handling a fatal error. Skipping.");
    return;
  }

  handlingFatalError = true;

  try {
    console.error("[FATAL ERROR]", message);

    // 🔊 Speak error message
    // TTS service guarantees mic safety internally
    await speakText(message);
  } catch (err) {
    // 🚫 Even error handling must never crash the app
    console.error("[FATAL ERROR] TTS failure:", err);
  } finally {
    // 🔓 Allow future fatal errors (never concurrently)
    handlingFatalError = false;
  }
};
