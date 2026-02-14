// src/services/authFlowService.ts

import { registerWithEmail, loginWithEmail } from "@/lib/firebase/auth";
import {
  createUserProfile,
  updateVoicePinHash,
  markFaceRegistered,
  getUserProfile,
} from "@/lib/firebase/users";
import { uploadFaceImage } from "@/lib/firebase/storage";

// 🔒 Explicit auth result type
export type AuthResult =
  | { success: true; user: any }
  | { success: false; error: string };

/**
 * REGISTRATION PIPELINE
 * Identity + Biometric enforcement. 
 */
export const registerUserFlow = async ({
  email,
  password,
  voicePinHash,
  faceImage,
}: {
  email: string;
  password: string;
  voicePinHash: string;
  faceImage: File;
}): Promise<AuthResult> => {

  try {
    console.log("[AUTH] Starting registration pipeline");

    // 1️⃣ Firebase Authentication
    const user = await registerWithEmail(email, password);
    console.log("[AUTH] Firebase user created:", user.uid);

    // 2️⃣ Firestore profile
    await createUserProfile(user.uid, user.email!);
    console.log("[FIRESTORE] User profile created");
    // 3️⃣ Voice PIN
    await updateVoicePinHash(user.uid, voicePinHash);
    console.log("[AUTH] Voice PIN stored");

    // 4️⃣ Face upload (MANDATORY)
    const faceUrl = await uploadFaceImage(user.uid, faceImage);
    await markFaceRegistered(user.uid, faceUrl);
    console.log("[AUTH] Face registered");

    // ✅ Registration COMPLETE
    console.log("[AUTH] Registration completed (identity + biometrics)");

    return {
      success: true,
      user,
    };

  } catch (error: any) {
    console.error("[AUTH] Registration FAILED:", error);
    return {
      success: false,
      error: error?.message || "Registration failed",
    };
  }
};

/**
 * LOGIN PIPELINE
 */
export const loginUserFlow = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<AuthResult> => {
  try {
    const user = await loginWithEmail(email, password);
    console.log("[AUTH] Firebase login success:", user.uid);

    const profile = await getUserProfile(user.uid);

    if (!profile) {
      return { success: false, error: "User profile not found" };
    }

    return {
      success: true,
      user,
    };
  } catch (err: any) {
    console.error("[AUTH] Login failed:", err);
    return {
      success: false,
      error: err?.message || "Login failed",
    };
  }
};
