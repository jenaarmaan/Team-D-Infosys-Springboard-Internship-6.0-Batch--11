import { User } from "firebase/auth";
import {
  loginWithEmail,
  getAuthSecurityState,
  verifyVoicePin,
} from "@/lib/firebase/auth";
import { biometricService } from "./biometricService";

/* ======================================================
   TYPES (AUTHORITATIVE)
   ====================================================== */

export type LoginResult =
  | { status: "OK"; user: User; faceImageUrl?: string }
  | { status: "BIOMETRIC_REQUIRED"; user: User; }
  | { status: "VOICE_PIN_REQUIRED"; user: User; }
  | { status: "NO_FACE" }
  | { status: "BAD_PIN" }
  | { status: "AUTH_FAILED" };

/* ======================================================
   GRANULAR LOGIN STEPS
   ====================================================== */

/**
 * STEP 1: INITIAL CREDENTIALS (EMAIL + PASSWORD)
 * Verifies basic account access.
 */
export const loginStep1BaseAuth = async (email: string, password: string): Promise<LoginResult> => {
  try {
    const user = await loginWithEmail(email, password);
    if (!user) return { status: "AUTH_FAILED" };

    // Check if face is even registered before proceeding
    const security = await getAuthSecurityState(user.uid);
    if (!security.faceRegistered) return { status: "NO_FACE" };

    // If basic auth is OK and face is registered, we move to Biometric
    console.log("[LOGIN FLOW] Base Auth OK. Proceeding to Biometric Phase.");

    // Initialize AI models early
    await biometricService.init();

    return { status: "BIOMETRIC_REQUIRED", user };
  } catch (err) {
    console.error("[LOGIN FLOW] Step 1 Failed:", err);
    return { status: "AUTH_FAILED" };
  }
};

/**
 * STEP 2: FINALIZE WITH VOICE PIN
 * This is called AFTER Biometric (Liveness + Face Match) has passed on the UI.
 */
export const loginStep2Finalize = async (user: User, spokenPin: string): Promise<LoginResult> => {
  try {
    console.log("[LOGIN FLOW] Finalizing login with Voice PIN...");
    const pinValid = await verifyVoicePin(user.uid, spokenPin);

    if (!pinValid) {
      console.warn("[LOGIN FLOW] Invalid voice PIN");
      return { status: "BAD_PIN" };
    }

    console.log("[LOGIN FLOW] ✅ Login successful.");
    return { status: "OK", user };
  } catch (err) {
    console.error("[LOGIN FLOW] Step 2 Failed:", err);
    return { status: "AUTH_FAILED" };
  }
};

/**
 * LEGACY / ONE-SHOT WRAPPER (For backward compatibility if needed)
 */
export const loginUserSecurely = async ({
  email,
  password,
  spokenPin,
}: {
  email: string;
  password: string;
  spokenPin: string;
}): Promise<LoginResult> => {
  const step1 = await loginStep1BaseAuth(email, password);
  if (step1.status !== "BIOMETRIC_REQUIRED") return step1;
  return loginStep2Finalize(step1.user, spokenPin);
};
