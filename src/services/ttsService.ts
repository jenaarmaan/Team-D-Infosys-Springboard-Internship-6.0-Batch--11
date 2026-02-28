// src/services/ttsService.ts

import {
  pauseListening,
  resumeListening,
} from "@/lib/govind/voiceStateController";

/* ======================================================
   🔊 TEXT-TO-SPEECH (SAFE & AUTHORITATIVE)
   ====================================================== */

/**
 * SPEAK TEXT — SINGLE SOURCE OF TRUTH
 *
 * GUARANTEES:
 * - Mic pauses ONLY via pauseListening("TTS")
 * - Mic resumes ONLY if it was paused by TTS
 * - No blind resume
 * - No forced start()
 * - No state assumptions
 * - Fully fail-safe
 */

let isSpeaking = false;
const finalizeTTS = (resolve: () => void) => {
  if (!isSpeaking) return;

  isSpeaking = false;
  document.body.dataset.ttsActive = "false";

  // 🕒 USER FIX: 1 second pause before listening starts
  setTimeout(() => {
    resumeListening("TTS");
  }, 1000);

  resolve();
};
/**
 * HARD INTERRUPT — stop speech immediately
 * Used when user speaks during TTS
 */
export const interruptTTS = (shouldResume = true) => {
  if (!isSpeaking) return;

  console.log("[TTS] Interrupted. Should Resume Mic:", shouldResume);
  window.speechSynthesis.cancel();
  isSpeaking = false;
  document.body.dataset.ttsActive = "false";

  if (shouldResume) {
    setTimeout(() => {
      resumeListening("TTS");
    }, 100);
  }
};



/**
 * WARM UP — unlock speech synthesis on user gesture
 */
export const warmUpTTS = () => {
  try {
    const utterance = new SpeechSynthesisUtterance("");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
    console.log("[TTS] System warmed up");
  } catch (e) {
    console.error("[TTS] Warm up failed:", e);
  }
};



export const speakText = (text: string, options?: { cancelPrevious?: boolean, volume?: number, rate?: number }): Promise<void> => {
  return new Promise((resolve) => {
    // 🔒 Prevent overlapping speech unless forced
    if (isSpeaking) {
      if (options?.cancelPrevious) {
        console.log("[TTS] Cancelling previous speech to prioritize new request.");
        interruptTTS(false); // 🔒 IMPORTANT: Do not resume mic yet, we are about to speak again
        // Fall through to start new speech
      } else {
        console.warn("[TTS] Already speaking — skipping");
        resolve();
        return;
      }
    }

    isSpeaking = true;
    document.body.dataset.ttsActive = "true";


    try {
      console.log("[TTS] Speaking:", text, "Volume:", options?.volume, "Rate:", options?.rate);
      document.body.dataset.ttsActive = "true";


      // 🔒 Pause mic ONLY once per speech lifecycle
      pauseListening("TTS");


      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";

      if (options?.volume !== undefined) utterance.volume = options.volume;
      if (options?.rate !== undefined) utterance.rate = options.rate;

      utterance.onstart = () => {
        console.log("[TTS] Speech started");
      };

      utterance.onend = () => {
        console.log("[TTS] Speech ended");
        clearTimeout(safetyTimeout);
        finalizeTTS(resolve);
      };

      utterance.onerror = (err) => {
        console.error("[TTS] Speech error:", err);
        clearTimeout(safetyTimeout);
        finalizeTTS(resolve);
      };

      // 🚫 Prevent queue buildup
      window.speechSynthesis.cancel();

      // 🧯 HARD FAILSAFE — prevent mic deadlock
      const safetyTimeout = setTimeout(() => {
        if (isSpeaking) {
          console.warn("[TTS] Safety timeout triggered — forcing cleanup");
          finalizeTTS(resolve);
        }
      }, 15000); // 15s max speech

      window.speechSynthesis.speak(utterance);

    } catch (err) {
      console.error("[TTS] Fatal error:", err);
      finalizeTTS(resolve);

    }
  });
};
