// govind/lib/govind/voiceStateController.ts

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

/* ======================================================
   🎙️ MIC FSM (AUTHORITATIVE)
   ====================================================== */

type MicState = "IDLE" | "LISTENING" | "PAUSED_BY_REASON";

export type PauseReason =
  | "TTS"
  | "FACE_CAPTURE"
  | "PIN_ENTRY"
  | "ERROR"
  | "GLOBAL_EXIT";

let recognition: any | null = null;
let micState: MicState = "IDLE";
const pauseReasons = new Set<PauseReason>();
let pausedByTTS = false;
let restartInProgress = false;

// Deadlock prevention
const DEADLOCK_TIMEOUT_MS = 10000;
let deadlockTimer: ReturnType<typeof setTimeout> | null = null;

const resetDeadlockTimer = () => {
  if (deadlockTimer) clearTimeout(deadlockTimer);
  deadlockTimer = setTimeout(() => {
    if (pauseReasons.size > 0 || restartInProgress) {
      console.warn("[VOICE] Deadlock watchdog triggered — forcing recovery");
      pauseReasons.clear();
      restartInProgress = false;
      pausedByTTS = false;
      if (micState !== "LISTENING" && recognition) {
        try {
          recognition.start();
          micState = "LISTENING";
        } catch { }
      }
    }
  }, DEADLOCK_TIMEOUT_MS);
};

export const forceUnlockMic = () => {
  console.warn("[VOICE] forceUnlockMic — clearing all locks");
  pauseReasons.clear();
  restartInProgress = false;
  pausedByTTS = false;
  if (deadlockTimer) clearTimeout(deadlockTimer);
  if (micState !== "LISTENING" && recognition) {
    try {
      recognition.start();
      micState = "LISTENING";
    } catch { }
  }
};

/* ======================================================
   🔌 INIT (ONCE ONLY)
   ====================================================== */

export const initVoiceRecognition = (rec: any) => {
  if (recognition) {
    console.warn("[VOICE] Recognition already initialized — ignored");
    return;
  }

  recognition = rec;
  micState = "IDLE";
  pauseReasons.clear();

  recognition.onstart = () => {
    micState = "LISTENING";
    restartInProgress = false;
    console.log("[VOICE] Mic opened");
  };

  recognition.onend = () => {
    console.log("[VOICE] onend received. Current state:", micState, "Pause reasons:", Array.from(pauseReasons));

    // If state is not LISTENING, it means we stopped intentionally or had an error
    if (micState !== "LISTENING") {
      micState = "IDLE";
    }

    // ⛔ DO NOT restart if there are active pause reasons
    if (pauseReasons.size > 0) {
      console.log("[VOICE] onend — paused by reasons, skip auto-restart");
      return;
    }

    if (restartInProgress) {
      console.log("[VOICE] onend — restart already in progress, skipping");
      return;
    }

    // 🚀 AUTO-RESTART
    restartInProgress = true;
    resetDeadlockTimer();

    setTimeout(() => {
      if (pauseReasons.size > 0) {
        restartInProgress = false;
        return;
      }

      try {
        console.log("[VOICE] onend — attempting auto-restart");
        recognition.start();
        micState = "LISTENING";
      } catch (err: any) {
        if (err.name === 'InvalidStateError') {
          console.log("[VOICE] restart skipped: already started");
        } else {
          console.warn("[VOICE] auto-restart failed", err);
        }
        restartInProgress = false;
      }
    }, 100);
  };

  recognition.onerror = (event: any) => {
    console.error("[VOICE] Mic error:", event.error, event.message);

    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      pauseListening("ERROR");
    }

    if (event.error === 'network') {
      console.warn("[VOICE] Network error detected, letting onend handle recovery");
    }

    micState = "IDLE";
    restartInProgress = false;
  };

  console.log("[VOICE] Recognition initialized");
};

/* ======================================================
   ▶️ START LISTENING (SAFE)
   ====================================================== */

export const startListening = () => {
  if (!recognition) {
    console.warn("[VOICE] startListening before init");
    return;
  }

  if (micState === "LISTENING") {
    console.log("[VOICE] Mic already listening — ignored");
    return;
  }

  if (pauseReasons.size > 0) {
    console.log(
      "[VOICE] startListening blocked by",
      Array.from(pauseReasons)
    );
    return;
  }

  try {
    if (restartInProgress) {
      console.log("[VOICE] startListening ignored — restart in progress");
      return;
    }
    recognition.start();
    micState = "LISTENING";
    console.log("[VOICE] Listening started");
  } catch (err) {
    console.warn("[VOICE] startListening failed", err);
    micState = "IDLE";
  }
};

/* ======================================================
   ⏸️ PAUSE (EXPLICIT)
   ====================================================== */

export const pauseListening = (reason: PauseReason) => {
  if (!recognition) return;

  pauseReasons.add(reason);
  if (reason === "TTS") {
    pausedByTTS = true;
  }

  resetDeadlockTimer();

  if (micState === "LISTENING") {
    try {
      recognition.stop();
    } catch { }
    micState = "PAUSED_BY_REASON";
    console.log("[VOICE] Paused by", reason);
  }
};

/* ======================================================
   ▶️ RESUME (ONLY IF PAUSED)
   ====================================================== */

export const resumeListening = (reason: PauseReason) => {
  if (!pauseReasons.has(reason)) return;

  pauseReasons.delete(reason);

  if (pauseReasons.size > 0) return;
  if (!recognition) return;

  if (reason === "TTS") {
    pausedByTTS = false;
  }

  try {
    console.log("[VOICE] resumeListening — attempting restart");
    recognition.start();
    micState = "LISTENING";
    if (deadlockTimer) clearTimeout(deadlockTimer);
  } catch (err) {
    console.warn("[VOICE] resumeListening failed", err);
  }
};

/* ======================================================
   🛑 STOP (HARD)
   ====================================================== */

export const stopListening = () => {
  if (!recognition) return;
  if (deadlockTimer) clearTimeout(deadlockTimer);

  try {
    pauseReasons.clear();
    restartInProgress = false;
    recognition.stop();
  } catch { }

  micState = "IDLE";
  console.log("[VOICE] Listening stopped");
};

/* ======================================================
   🟢 READY AFTER TTS
   ====================================================== */

export const setReadyForCommand = () => {
  resumeListening("TTS");
};

/* ======================================================
   🌅 WAKE RESUME (GLOBAL_EXIT)
   ====================================================== */

export const resumeAfterWake = () => {
  if (pauseReasons.has("GLOBAL_EXIT")) {
    pauseReasons.delete("GLOBAL_EXIT");
    console.log("[VOICE] GLOBAL_EXIT cleared on wake");
  }

  if (pauseReasons.size === 0 && micState !== "LISTENING") {
    try {
      recognition?.start();
      micState = "LISTENING";
      console.log("[VOICE] Mic resumed after wake");
    } catch (err) {
      console.warn("[VOICE] Wake resume failed", err);
    }
  }
};

/* ======================================================
   🔍 STATE HELPERS
   ====================================================== */

export const isListening = () => micState === "LISTENING";
export const isPaused = () => micState === "PAUSED_BY_REASON";
export const getMicState = () => micState;

/* ======================================================
   💣 HARD RESET (RARE)
   ====================================================== */

export const resetVoiceController = () => {
  if (deadlockTimer) clearTimeout(deadlockTimer);
  try {
    recognition?.stop();
  } catch { }

  recognition = null;
  micState = "IDLE";
  pauseReasons.clear();
  restartInProgress = false;
  pausedByTTS = false;

  console.log("[VOICE] Controller hard reset");
};
