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
      safeStart("deadlock-recovery");
    }
  }, DEADLOCK_TIMEOUT_MS);
};

export const forceUnlockMic = () => {
  console.warn("[VOICE] forceUnlockMic — clearing all locks");
  pauseReasons.clear();
  restartInProgress = false;
  pausedByTTS = false;
  if (deadlockTimer) clearTimeout(deadlockTimer);
  safeStart("force-unlock");
};

/* ======================================================
   🔌 INIT (ONCE ONLY)
   ====================================================== */

let lastErrorType = "";
let lastErrorTime = 0;
let lastStartTime = 0;

const safeStart = (source: string) => {
  if (!recognition) return;
  if (micState === "LISTENING") {
    return;
  }
  if (pauseReasons.size > 0) {
    console.log(`[VOICE] ${source} — start blocked by`, Array.from(pauseReasons));
    return;
  }

  const now = Date.now();
  // Prevent rapid-fire starts (min 500ms apart)
  if (now - lastStartTime < 500) {
    return;
  }

  // If we just had an 'aborted' error, wait longer
  if (lastErrorType === 'aborted' && now - lastErrorTime < 2000) {
    console.log(`[VOICE] ${source} — backing off (abort cooling)`);
    // 🔥 Schedule a retry to ensure the mic eventually turns on
    setTimeout(() => safeStart(`${source}-retry`), 1500);
    return;
  }

  try {
    recognition.start();
    lastStartTime = now;
    micState = "LISTENING";
    console.log(`[VOICE] Mic opened (${source})`);
  } catch (err: any) {
    if (err.name === 'InvalidStateError') {
      micState = "LISTENING";
    } else {
      console.warn(`[VOICE] ${source} start failed:`, err);
      micState = "IDLE";
    }
    restartInProgress = false;
  }
};

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
    lastErrorType = ""; // Reset errors on success
  };

  recognition.onend = () => {
    console.log("[VOICE] onend received. State:", micState, "Reasons:", Array.from(pauseReasons));

    // If we're here, the session is definitely closed
    if (micState !== "PAUSED_BY_REASON") {
      micState = "IDLE";
    }

    if (pauseReasons.size > 0 || restartInProgress) {
      return;
    }

    // 🚀 AUTO-RESTART with backoff
    restartInProgress = true;
    resetDeadlockTimer();

    const delay = lastErrorType === 'aborted' ? 2000 : 300;

    setTimeout(() => {
      restartInProgress = false;
      safeStart("auto-restart");
    }, delay);
  };

  recognition.onerror = (event: any) => {
    lastErrorType = event.error;
    lastErrorTime = Date.now();
    console.error("[VOICE] Mic error:", event.error, event.message);

    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      pauseListening("ERROR");
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
  safeStart("manual-start");
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

  if (deadlockTimer) clearTimeout(deadlockTimer);
  safeStart("resume");
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

  if (pauseReasons.size === 0) {
    safeStart("wake-resume");
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
