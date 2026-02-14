// src/lib/govind/stateMachine.ts

/**
 * Govind assistant finite states
 * SINGLE SOURCE OF TRUTH
 */
export type GovindState =
  | "DORMANT"      // initial boot only
  | "SLEEPING"     // explicit exit / sleep
  | "AWAKE"
  | "LISTENING"
  | "AUTH_REGISTER"
  | "AUTH_LOGIN"
  | "WAITING_FOR_FACE"
  | "WAITING_FOR_LIVENESS"
  | "WAITING_FOR_PIN"
  | "PROCESSING"
  | "RESPONDING"
  | "AUTHENTICATED"
  | "REGISTERING"
  | "AUTHENTICATING"
  | "AUTH_FAILED"
  | "ERROR";




const AUTH_STATES: GovindState[] = [
  "AUTH_REGISTER",
  "AUTH_LOGIN",
  "REGISTERING",
  "AUTHENTICATING",
  "WAITING_FOR_LIVENESS",
  "AUTH_FAILED",
];


/* ======================================================
   🛑 HARD MIC STOP STATES
   ====================================================== */

/**
 * In these states:
 * - Mic must NOT auto-restart
 * - Exit / sleep enforced
 */
const MIC_HARD_STOP_STATES: GovindState[] = [
  "SLEEPING",
  "DORMANT",
  "RESPONDING",
];


/* ======================================================
   🚫 HARD BLOCK STATES
   ====================================================== */

/**
 * In these states:
 * - NO voice input
 */

// NOTE: ERROR state must allow voice for recovery
const VOICE_BLOCKED_STATES: GovindState[] = [
  "PROCESSING",
  "RESPONDING",
  "WAITING_FOR_FACE",
  "WAITING_FOR_LIVENESS",
  "SLEEPING",
  "DORMANT",
];



/**
 * In these states:
 * - ONLY PIN input is allowed
 */
const PIN_ONLY_STATES: GovindState[] = [
  "WAITING_FOR_PIN",
];

/* ======================================================
   🎙️ VOICE PERMISSION RULES
   ====================================================== */

/**
 * Can Govind accept ANY voice input?
 */

export const canAcceptVoice = (state: GovindState): boolean => {
  if (state === "LISTENING" || state === "AWAKE") return true;

  // 🔒 AUTH FLOWS MUST ALWAYS ACCEPT VOICE
  if (AUTH_STATES.includes(state)) return true;

  // 🚫 Hard-blocked states
  if (VOICE_BLOCKED_STATES.includes(state)) return false;

  return true;
};

/* ======================================================
   🎤 MIC RESTART RULES
   ====================================================== */

/**
 * Can mic auto-restart in this state?
 */


export const canRestartMic = (state: GovindState) => {
  return (
    state === "LISTENING" ||
    state === "AWAKE" ||
    state === "SLEEPING" ||   // ✅ ADD THIS
    state === "AUTH_LOGIN" ||
    state === "AUTH_REGISTER"
  );
};


/**
 * Is assistant expecting ONLY PIN input?
 */
export const isPinOnlyState = (state: GovindState): boolean => {
  return PIN_ONLY_STATES.includes(state);
};

/**
 * Is voice completely blocked?
 */
export const isVoiceBlockedState = (state: GovindState): boolean => {
  return VOICE_BLOCKED_STATES.includes(state);
};

/* ======================================================
   🔊 SPEAKING PERMISSION RULES
   ====================================================== */

/**
 * Can Govind speak in this state?
 */
export const canSpeak = (state: GovindState): boolean => {
  switch (state) {
    case "AWAKE":
    case "LISTENING":
    case "AUTH_REGISTER":
    case "AUTH_LOGIN":
    case "ERROR":
    case "REGISTERING":
    case "AUTHENTICATING":
    case "AUTH_FAILED":
      return true;


    default:
      return false;
  }
};
