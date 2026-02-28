//src/services/registrationFlow.ts

import { registerWithEmail } from "@/lib/firebase/auth";
import { uploadFaceImage } from "@/lib/firebase/storage";
import {
  createUserProfile,
  updateVoicePinHash,
  markFaceRegistered,
} from "@/lib/firebase/users";

type RegistrationErrorCode =
  | "INVALID_INPUT"
  | "AUTH_FAILED"
  | "PROFILE_FAILED"
  | "FACE_UPLOAD_FAILED"
  | "FACE_MARK_FAILED"
  | "PIN_STORE_FAILED"
  | "UNKNOWN";

/**
 * COMPLETE REGISTRATION PIPELINE
 *
 * SINGLE SOURCE OF TRUTH
 *
 * ORDER (LOCKED & NON-NEGOTIABLE):
 * 1. Create Firebase Auth user
 * 2. Create Firestore user profile
 * 3. Upload face image to Storage
 * 4. Mark face as registered
 * 5. Store voice PIN hash
 *
 * ❌ No voice logic
 * ❌ No UI logic
 * ❌ No mic logic
 * ❌ No state logic
 */
export const completeRegistration = async ({
  email,
  password,
  appPassword,
  voicePinHash,
  faceImage,
}: {
  email: string;
  password: string;
  appPassword?: string;
  voicePinHash: string;
  faceImage: File;
}): Promise<
  | { status: "OK"; uid: string }
  | {
    status: "FAIL";
    error: string;
    code: RegistrationErrorCode;
    failedStep: string;
  }
> => {
  let currentStep = "INIT";
  try {
    /* ================= VALIDATION ================= */

    if (!email || !password) {
      throw {
        message: "Email and password are required",
        code: "INVALID_INPUT",
      };
    }

    // Firebase requires at least 6 characters for passwords
    if (password.length < 6) {
      throw {
        message: "Password must be at least 6 characters long",
        code: "INVALID_INPUT",
      };
    }

    if (!faceImage) {
      throw {
        message: "Face image is required",
        code: "INVALID_INPUT",
      };
    }

    if (!voicePinHash) {
      throw {
        message: "Voice PIN is required",
        code: "INVALID_INPUT",
      };
    }

    currentStep = "CREATE_AUTH_USER";
    console.log("[REGISTRATION] Step 1: Creating Firebase Auth user");


    /* ================= STEP 1 ================= */

    const user = await registerWithEmail(email, password);

    if (!user?.uid) {
      throw {
        message: "Firebase user UID not created",
        code: "AUTH_FAILED",
      };
    }

    const uid = user.uid;
    console.log("REGISTER UID:", uid);
    console.log("REGISTER EMAIL:", user.email);
    console.log("[REGISTRATION] UID confirmed:", uid);

    /* ================= STEP 2 ================= */

    currentStep = "CREATE_PROFILE";
    console.log("[REGISTRATION] Step 2: Creating Firestore profile");
    try {
      await createUserProfile(uid, email);
    } catch (err: any) {
      console.error("[REGISTRATION] Firestore profile creation failed. Rolling back auth...", err);
      try {
        await user.delete();
        console.log("[REGISTRATION] Rollback successful: Auth user deleted.");
      } catch (deleteErr) {
        console.error("[REGISTRATION] Rollback failed: Could not delete auth user.", deleteErr);
      }
      throw {
        message: "Failed to create user profile",
        code: "PROFILE_FAILED",
      };
    }

    /* ================= STEP 3 ================= */

    currentStep = "UPLOAD_FACE";
    console.log("[REGISTRATION] Step 3: Uploading face image");
    let faceUrl = "";
    try {
      faceUrl = await uploadFaceImage(uid, faceImage);
    } catch {
      throw {
        message: "Face image upload failed",
        code: "FACE_UPLOAD_FAILED",
      };
    }

    /* ================= STEP 4 ================= */

    currentStep = "MARK_FACE";
    console.log("[REGISTRATION] Step 4: Marking face as registered");
    try {
      await markFaceRegistered(uid, faceUrl);
    } catch {

      throw {
        message: "Failed to mark face as registered",
        code: "FACE_MARK_FAILED",
      };
    }

    /* ================= STEP 5 ================= */

    currentStep = "STORE_PIN";
    console.log("[REGISTRATION] Step 5: Storing voice PIN hash");
    try {
      await updateVoicePinHash(uid, voicePinHash);
    } catch {
      throw {
        message: "Failed to store voice PIN",
        code: "PIN_STORE_FAILED",
      };
    }

    /* ================= STEP 6 ================= */
    if (appPassword) {
      currentStep = "STORE_APP_PASSWORD";
      console.log("[REGISTRATION] Step 6: Storing Gmail App Password");
      try {
        const { updateGmailAppPassword } = await import("@/lib/firebase/users");
        await updateGmailAppPassword(uid, appPassword);
      } catch (err) {
        console.error("Failed to store app password:", err);
        // Non-fatal, but we should log it
      }
    }

    console.log("[REGISTRATION] ✅ Registration successful");

    return {
      status: "OK",
      uid
    };
  } catch (err: any) {
    console.error(
      "[REGISTRATION] ❌ Registration failed at step:",
      currentStep,
      err
    );

    return {
      status: "FAIL",
      error: err?.message || "Registration failed",
      code: err?.code || "UNKNOWN",
      failedStep: currentStep,
    };

  }
};

/**
 * 🔁 ROLLBACK STRATEGY (FUTURE)
 * - Delete Firebase Auth user
 * - Delete Firestore profile
 * - Delete uploaded face image
 * Triggered only if partial registration occurs
 */
