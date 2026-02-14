import { AuthSession, LoginStep } from "./authTypes";

/* ================= AUTH STATES ================= */

export type AuthFlowState =
  | "LISTENING"
  | "REGISTERING"
  | "WAITING_FOR_FACE"
  | "WAITING_FOR_PIN"
  | "ERROR";

/* ================= SESSION ================= */

export const createAuthSession = (): AuthSession => ({
  mode: "NONE",
  step: null,
  retries: 0,
  tempData: {},
});

export const resetAuthSession = (): AuthSession => ({
  mode: "NONE",
  step: null,
  retries: 0,
  tempData: {},
});

/* ================= REGISTRATION STEPS ================= */

export const REGISTER_STEPS = [
  "EMAIL",
  "CONFIRM_EMAIL",
  "PASSWORD",
  "CONFIRM_PASSWORD",
  "APP_PASSWORD",
  "CONFIRM_APP_PASSWORD",
  "FACE",
  "VOICE_PIN",
  "CONFIRM_VOICE_PIN",
  "COMPLETE",
] as const;

export type RegisterStep = typeof REGISTER_STEPS[number];

/* ================= STEP RULES ================= */

// Only these steps accept voice input
export const VOICE_ALLOWED_STEPS: RegisterStep[] = [
  "EMAIL",
  "CONFIRM_EMAIL",
  "PASSWORD",
  "CONFIRM_PASSWORD",
  "APP_PASSWORD",
  "CONFIRM_APP_PASSWORD",
  "VOICE_PIN",
  "CONFIRM_VOICE_PIN",
];


// FACE must NEVER advance automatically
export const isBlockingStep = (step: RegisterStep) => {
  return step === "FACE";
};

/* ================= STEP TRANSITION ================= */

export const getNextStep = (
  currentStep: RegisterStep,
  context?: { faceCaptured?: boolean }
): RegisterStep | null => {
  const idx = REGISTER_STEPS.indexOf(currentStep);
  if (idx === -1 || idx === REGISTER_STEPS.length - 1) return null;

  // ⛔ Block FACE → PIN unless face is actually captured
  if (currentStep === "FACE" && !context?.faceCaptured) {
    return null;
  }

  return REGISTER_STEPS[idx + 1];
};

export const getPreviousStep = (
  currentStep: RegisterStep
): RegisterStep | null => {
  const idx = REGISTER_STEPS.indexOf(currentStep);
  if (idx <= 0) return null;
  return REGISTER_STEPS[idx - 1];
};

/* ================= LOGIN STEPS ================= */

export const LOGIN_STEPS = [
  "FACE",
  "VOICE_PIN",
  "SUCCESS",
] as const;

/* ================= LOGIN STEP RULES ================= */

// FACE must complete before advancing to PIN
export const canAdvanceLogin = (
  currentStep: LoginStep,
  context?: { faceVerified?: boolean; pinVerified?: boolean }
): boolean => {
  if (currentStep === "FACE" && !context?.faceVerified) return false;
  if (currentStep === "VOICE_PIN" && !context?.pinVerified) return false;
  return true;
};

/* ================= LOGIN STEP TRANSITION ================= */

export const getNextLoginStep = (
  currentStep: LoginStep,
  context?: { faceVerified?: boolean; pinVerified?: boolean }
): LoginStep | null => {
  const idx = LOGIN_STEPS.indexOf(currentStep as any);
  if (idx === -1 || idx === LOGIN_STEPS.length - 1) return null;

  if (!canAdvanceLogin(currentStep, context)) return null;

  return LOGIN_STEPS[idx + 1];
};

export const getPreviousLoginStep = (
  currentStep: LoginStep
): LoginStep | null => {
  const idx = LOGIN_STEPS.indexOf(currentStep as any);
  if (idx <= 0) return null;
  return LOGIN_STEPS[idx - 1];
};

/* ================= SESSION STATE VALIDATION ================= */

/**
 * Pure state check — no storage access
 * Returns true if session represents valid authenticated state
 */
export const isSessionValid = (session: AuthSession): boolean => {
  if (session.mode === "NONE") return false;
  if (session.retries > 3) return false;
  return true;
};

/**
 * Check if auth flow is in a terminal state
 */
export const isAuthComplete = (session: AuthSession): boolean => {
  if (session.mode === "REGISTER" && session.step === "COMPLETE") return true;
  if (session.mode === "LOGIN" && session.step === "SUCCESS") return true;
  return false;
};
