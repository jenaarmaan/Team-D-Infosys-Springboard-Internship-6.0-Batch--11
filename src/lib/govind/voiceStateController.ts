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
let restartInProgress = false;
let isStarting = false; // Lock to prevent overlapping .start() calls

// 🔄 Re-initialization Hook
let reinitCallback: (() => void) | null = null;
export const setVoiceReinitCallback = (cb: () => void) => {
  reinitCallback = cb;
};

// Deadlock prevention
const DEADLOCK_TIMEOUT_MS = 12000;
let deadlockTimer: ReturnType<typeof setTimeout> | null = null;

const resetDeadlockTimer = () => {
  if (deadlockTimer) clearTimeout(deadlockTimer);
  deadlockTimer = setTimeout(() => {
    if (pauseReasons.size > 0 || restartInProgress || isStarting) {
      console.warn("[VOICE] Deadlock watchdog triggered — forcing recovery");
      pauseReasons.clear();
      restartInProgress = false;
      isStarting = false;
      safeStart("deadlock-recovery");
    }
  }, DEADLOCK_TIMEOUT_MS);
};

export const forceUnlockMic = () => {
  console.warn("[VOICE] forceUnlockMic — clearing all locks");
  pauseReasons.clear();
  restartInProgress = false;
  isStarting = false;
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
  if (micState === "LISTENING" || isStarting) {
    console.log(`[VOICE] ${source} — start ignored (state: ${micState}, starting: ${isStarting})`);
    return;
  }
  if (pauseReasons.size > 0) {
    console.log(`[VOICE] ${source} — start blocked by`, Array.from(pauseReasons));
    return;
  }

  const now = Date.now();
  // Prevent rapid-fire starts (min 1000ms apart for hardware sync)
  if (now - lastStartTime < 1000) {
    return;
  }

  // If we just had an 'aborted' error, wait significantly longer
  if (lastErrorType === 'aborted' && now - lastErrorTime < 4000) {
    console.log(`[VOICE] ${source} — backing off (abort cooling)`);
    if (currentRestartTimer) clearTimeout(currentRestartTimer);
    currentRestartTimer = setTimeout(() => safeStart(`${source}-retry`), 2500);
    return;
  }

  try {
    if (currentRestartTimer) clearTimeout(currentRestartTimer);
    isStarting = true;
    recognition.start();
    lastStartTime = now;
    console.log(`[VOICE] Mic opened (${source})`);
  } catch (err: any) {
    isStarting = false;
    if (err.name === 'InvalidStateError') {
      console.log("[VOICE] Attempted start in InvalidState — aligning state to LISTENING");
      micState = "LISTENING";
    } else {
      console.warn(`[VOICE] ${source} start failed:`, err);
      micState = "IDLE";
      errorBackoffCount++;
    }
  }
};

export const initVoiceRecognition = (rec: any) => {
  if (recognition && recognition !== rec) {
    console.log("[VOICE] Swapping recognition object — stopping old one");
    try {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.stop();
    } catch (e) { }
  }

  recognition = rec;
  micState = "IDLE";
  isStarting = false;

  recognition.onstart = () => {
    micState = "LISTENING";
    isStarting = false;
    restartInProgress = false;
    lastErrorType = "";

    // 🔥 Stability Window: Only reset backoff if it stays healthy for 8 seconds
    // We use a longer window (8s) because aborted errors often happen after a few seconds of silence
    setTimeout(() => {
      if (micState === "LISTENING") {
        console.log("[VOICE] Stability target reached (8s) — resetting backoff");
        errorBackoffCount = 0;
      }
    }, 8000);

    if (currentRestartTimer) clearTimeout(currentRestartTimer);
  };

  recognition.onend = () => {
    console.log("[VOICE] onend received. State:", micState, "Reasons:", Array.from(pauseReasons));

    isStarting = false;

    if (micState !== "PAUSED_BY_REASON") {
      micState = "IDLE";
    }

    if (pauseReasons.size > 0 || restartInProgress) {
      return;
    }

    // 🚀 AUTO-RESTART with exponential backoff
    restartInProgress = true;
    resetDeadlockTimer();

    // Calculate backoff: start at 1000ms, increase on errors, max 15s
    let delay = lastErrorType === 'aborted' ? 3000 : 1000;
    if (errorBackoffCount > 0) {
      delay = Math.min(delay * Math.pow(1.8, errorBackoffCount), 15000);
      console.log(`[VOICE] Backing off restart (count: ${errorBackoffCount}, delay: ${Math.round(delay)}ms)`);
    }

    if (currentRestartTimer) clearTimeout(currentRestartTimer);
    currentRestartTimer = setTimeout(() => {
      restartInProgress = false;
      safeStart("auto-restart");
    }, delay);
  };

  recognition.onerror = (event: any) => {
    isStarting = false;
    lastErrorType = event.error;
    lastErrorTime = Date.now();
    console.error("[VOICE] Mic error:", event.error, event.message);

    errorBackoffCount++;

    // 💣 RE-INITIALIZATION TRIGGER
    // If we hit 3 errors in a row (reduced from 4 for faster recovery)
    if (errorBackoffCount >= 3 && reinitCallback) {
      console.warn("[VOICE] Persistent error — Triggering Re-initialization");
      reinitCallback();
      errorBackoffCount = 0;
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
  resetDeadlockTimer();

  if (micState === "LISTENING") {
    try {
      // Use abort() for immediate halt to prevent 'onend' processing old data
      recognition.abort();
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
    isStarting = false;
    recognition.abort();
  } catch { }

  micState = "IDLE";
  console.log("[VOICE] Listening stopped");
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
    recognition?.abort();
  } catch { }

  recognition = null;
  micState = "IDLE";
  pauseReasons.clear();
  restartInProgress = false;
  isStarting = false;

  console.log("[VOICE] Controller hard reset");
};
