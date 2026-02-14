// src/lib/firebase/tokens.ts

import { db } from "./firebase";
import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Save Gmail OAuth token securely in Firestore
 * SINGLE SOURCE OF TRUTH
 *
 * ❌ Never store tokens in localStorage
 * ❌ Never store tokens in Contexts
 * ❌ Never expose tokens to UI
 */
export const saveGmailToken = async (
  uid: string,
  tokenData: {
    access_token: string;
    refresh_token?: string;
    scope?: string;
    expires_in?: number;
    token_type?: string;
  }
): Promise<void> => {
  await setDoc(doc(db, "gmail_tokens", uid), {
    ...tokenData,
    uid,
    updatedAt: serverTimestamp(),
  });

  console.log("[FIRESTORE] Gmail token saved for user:", uid);
};

/**
 * Fetch Gmail OAuth token for user
 * Used ONLY during session restore or Gmail init
 */
export const getGmailToken = async (
  uid: string
): Promise<any | null> => {
  const snap = await getDoc(doc(db, "gmail_tokens", uid));
  return snap.exists() ? snap.data() : null;
};

/**
 * Clear Gmail OAuth token (logout / disconnect)
 */
export const clearGmailToken = async (uid: string): Promise<void> => {
  await deleteDoc(doc(db, "gmail_tokens", uid));
  console.log("[FIRESTORE] Gmail token cleared for user:", uid);
};
