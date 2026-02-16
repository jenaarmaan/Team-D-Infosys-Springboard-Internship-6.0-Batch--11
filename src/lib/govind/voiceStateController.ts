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

// 🔄 Re-initialization Hook
let reinitCallback: (() => void) | null = null;
export const setVoiceReinitCallback = (cb: () => void) => {
  reinitCallback = cb;
};

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
let errorBackoffCount = 0;
let currentRestartTimer: ReturnType<typeof setTimeout> | null = null;

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
  if (now - lastStartTime < 800) {
    return;
  }

  // If we just had an 'aborted' error, wait significantly longer
  if (lastErrorType === 'aborted' && now - lastErrorTime < 3000) {
    console.log(`[VOICE] ${source} — backing off (abort cooling)`);
    if (currentRestartTimer) clearTimeout(currentRestartTimer);
    currentRestartTimer = setTimeout(() => safeStart(`${source}-retry`), 2000);
    return;
  }

  try {
    if (currentRestartTimer) clearTimeout(currentRestartTimer);
    recognition.start();
    lastStartTime = now;
    micState = "LISTENING";
    console.log(`[VOICE] Mic opened (${source})`);
  } catch (err: any) {
    if (err.name === 'InvalidStateError') {
      console.log("[VOICE] Attempted start in InvalidState — aligning state to LISTENING");
      micState = "LISTENING";
    } else {
      console.warn(`[VOICE] ${source} start failed:`, err);
      micState = "IDLE";
      errorBackoffCount++;
    }
    restartInProgress = false;
  }
};

export const initVoiceRecognition = (rec: any) => {
  // Clear previous instance if any (Hard Kill)
  if (recognition && recognition !== rec) {
    console.log("[VOICE] Swapping recognition object — stopping old one");
    try { recognition.onend = null; recognition.onerror = null; recognition.stop(); } catch (e) { }
  }

  recognition = rec;
  micState = "IDLE";
  // We dont clear pauseReasons here to preserve state across re-inits

  recognition.onstart = () => {
    micState = "LISTENING";
    restartInProgress = false;
    lastErrorType = "";

    // 🔥 Stability Window: Only reset backoff if it stays healthy for 5 seconds
    setTimeout(() => {
      if (micState === "LISTENING") {
        console.log("[VOICE] Stability target reached — resetting backoff count");
        errorBackoffCount = 0;
      }
    }, 5000);

    if (currentRestartTimer) clearTimeout(currentRestartTimer);
  };

  recognition.onend = () => {
    console.log("[VOICE] onend received. State:", micState, "Reasons:", Array.from(pauseReasons));

    if (micState !== "PAUSED_BY_REASON") {
      micState = "IDLE";
    }

    if (pauseReasons.size > 0 || restartInProgress) {
      return;
    }

    // 🚀 AUTO-RESTART with exponential backoff
    restartInProgress = true;
    resetDeadlockTimer();

    // Calculate backoff: start at 500ms, increase on errors, max 12s
    let delay = lastErrorType === 'aborted' ? 2500 : 500;
    if (errorBackoffCount > 0) {
      delay = Math.min(delay * Math.pow(1.6, errorBackoffCount), 12000);
      console.log(`[VOICE] Backing off restart (count: ${errorBackoffCount}, delay: ${Math.round(delay)}ms)`);
    }

    if (currentRestartTimer) clearTimeout(currentRestartTimer);
    currentRestartTimer = setTimeout(() => {
      restartInProgress = false;
      safeStart("auto-restart");
    }, delay);
  };

  recognition.onerror = (event: any) => {
    lastErrorType = event.error;
    lastErrorTime = Date.now();
    console.error("[VOICE] Mic error:", event.error, event.message);

    errorBackoffCount++;

    // 💣 RE-INITIALIZATION TRIGGER
    // If we hit 4 aborted errors in a row, the browser object is likely wedged.
    if (errorBackoffCount >= 4 && reinitCallback) {
      console.warn("[VOICE] 4 consecutive errors — Triggering Total Re-initialization");
      reinitCallback();
      errorBackoffCount = 0; // Reset to avoid loop
      return;
    }

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
