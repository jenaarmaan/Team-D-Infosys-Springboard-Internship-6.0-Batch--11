import { db } from "./firebase";
import bcrypt from "bcryptjs";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

/**
 * User profile stored in Firestore
 * SINGLE SOURCE OF TRUTH for auth + security state
 */
export interface UserProfile {
  uid: string;
  email: string;
  createdAt: any;

  security: {
    faceRegistered: boolean;
    faceImageUrl?: string;
    voicePinEnabled: boolean;
    voicePinHash?: string;
    gmailAppPassword?: string;
  };


  preferences: {
    language: string;
    voiceSpeed: number;
  };

  connectedApps: {
    gmail: boolean;
    outlook: boolean;
    telegram: boolean;
    whatsapp: boolean;
  };
}

/* ======================================================
   👤 USER PROFILE CREATION
   ====================================================== */

/**
 * Create user profile after Firebase Auth registration
 * Called EXACTLY ONCE during registration flow
 */
export const createUserProfile = async (
  uid: string,
  email: string
): Promise<void> => {
  console.log("Firestore path UID:", uid);
  console.log("Firestore path EMAIL:", email);
  const ref = doc(db, "users", uid);

  const profile: UserProfile = {
    uid,
    email,
    createdAt: serverTimestamp(),

    security: {
      faceRegistered: false,
      voicePinEnabled: false,
      // voicePinHash intentionally omitted
    },

    preferences: {
      language: "en",
      voiceSpeed: 1,
    },

    connectedApps: {
      gmail: false,
      outlook: false,
      telegram: false,
      whatsapp: false,
    },
  };

  await setDoc(ref, profile);
  console.log("[FIRESTORE] User profile created:", uid);
};

/* ======================================================
   📥 READ OPERATIONS
   ====================================================== */

/**
 * Fetch full user profile
 */
export const getUserProfile = async (
  uid: string
): Promise<UserProfile | null> => {
  console.log("Firestore path UID:", uid);
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
};

import { query, where, getDocs, collection } from "firebase/firestore";

/**
 * Fetch security state by email (for pre-login UI)
 */
export const getSecurityStateByEmail = async (email: string) => {
  console.log("Firestore path EMAIL:", email);
  /** 
   * ⚠️ SECURITY WARNING: This query bypasses UID-based security rules.
   * If failing with 'Insufficient Permissions', this function is the likely cause.
   */
  const q = query(collection(db, "users"), where("email", "==", email));
  const snap = await getDocs(q);

  if (snap.empty) {
    throw new Error("USER_NOT_FOUND");
  }

  const data = snap.docs[0].data();
  return {
    uid: data.uid,
    faceRegistered: data.security?.faceRegistered || false,
    faceImageUrl: data.security?.faceImageUrl || null,
  };
};

/**
 * Fetch authentication-related security state (authoritative)
 * Used by login flow only
 */
export const getAuthSecurityState = async (uid: string) => {
  console.log("Firestore path UID:", uid);
  const snap = await getDoc(doc(db, "users", uid));

  if (!snap.exists()) {
    throw new Error("USER_NOT_FOUND");
  }

  const data = snap.data();
  return {
    faceRegistered: data.security?.faceRegistered || false,
    faceImageUrl: data.security?.faceImageUrl || null,
    voicePinEnabled: data.security?.voicePinEnabled || false,
    voicePinHash: data.security?.voicePinHash ?? null,
  };
};


/* ======================================================
   🔐 SECURITY UPDATES
   ====================================================== */

/**
 * Store voice PIN hash securely and enable PIN auth
 */
export const updateVoicePinHash = async (
  uid: string,
  pinHash: string
): Promise<void> => {
  console.log("Firestore path UID:", uid);
  try {
    await updateDoc(doc(db, "users", uid), {
      "security.voicePinHash": pinHash,
      "security.voicePinEnabled": true,
    });

    console.log("[FIRESTORE] Voice PIN enabled for user:", uid);
  } catch (error) {
    console.error(
      "[FIRESTORE] Failed to update voice PIN for user:",
      uid,
      error
    );
    throw error;
  }
};

/**
 * Mark face as registered.
 * We store "LOCAL" as the URL because the actual image is in browser LocalStorage
 * to avoid cloud storage costs.
 */
export const markFaceRegistered = async (uid: string, faceImageUrl: string): Promise<void> => {
  console.log("Firestore path UID:", uid);
  try {
    await updateDoc(doc(db, "users", uid), {
      "security.faceRegistered": true,
      "security.faceImageUrl": faceImageUrl || "LOCAL",
    });
    console.log("[FIRESTORE] Face marked as registered for user:", uid);
  } catch (error) {
    console.error("[FIRESTORE] Failed to mark face registered:", uid, error);
    throw error;
  }
};

/**
 * Store Gmail App Password
 */
export const updateGmailAppPassword = async (
  uid: string,
  appPassword: string
): Promise<void> => {
  await updateDoc(doc(db, "users", uid), {
    "security.gmailAppPassword": appPassword,
    "connectedApps.gmail": true,
  });
};



/* ======================================================
   🔌 CONNECTED APPS
   ====================================================== */

/**
 * Update connected app status (Gmail, Outlook, etc.)
 */
export const updateConnectedApp = async (
  uid: string,
  app: keyof UserProfile["connectedApps"],
  value: boolean
): Promise<void> => {
  await updateDoc(doc(db, "users", uid), {
    [`connectedApps.${app}`]: value,
  });
};

/* ======================================================
   🔍 VERIFICATION HELPERS
   ====================================================== */

/**
 * Verify spoken voice PIN against stored hash
 * Used ONLY during login
 */
export const verifyVoicePin = async (
  uid: string,
  spokenPin: string
): Promise<boolean> => {
  const { voicePinEnabled, voicePinHash } =
    await getAuthSecurityState(uid);

  if (!voicePinEnabled || !voicePinHash) {
    return false;
  }

  return bcrypt.compare(spokenPin, voicePinHash);
};
