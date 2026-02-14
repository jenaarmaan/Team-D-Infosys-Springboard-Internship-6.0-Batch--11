// src/lib/google/googleOAuth.ts

import { auth } from "../firebase/firebase";
import { db } from "../firebase/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

declare global {
  interface Window {
    google: any;
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Gmail scopes
const GMAIL_SCOPES =
  "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify";

/**
 * Load Google Identity Services script
 */
export function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;

    script.onload = () => resolve();
    script.onerror = () =>
      reject("Failed to load Google Identity Services");

    document.body.appendChild(script);
  });
}

/**
 * Trigger Gmail OAuth flow and persist token to Firestore
 */
export async function connectGmail(): Promise<void> {
  if (!CLIENT_ID) {
    throw new Error("Google Client ID missing");
  }

  if (!auth.currentUser) {
    throw new Error("User must be logged in before connecting Gmail");
  }

  await loadGoogleScript();

  return new Promise((resolve, reject) => {
    const tokenClient =
      window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: GMAIL_SCOPES,
        callback: async (response: any) => {
          if (!response?.access_token) {
            reject("Gmail OAuth failed");
            return;
          }

          try {
            const uid = auth.currentUser!.uid;
            const expiresAt =
              Date.now() + response.expires_in * 1000;

            await setDoc(
              doc(db, "gmail_tokens", uid),
              {
                accessToken: response.access_token,
                expiresAt,
                scope: response.scope,
                provider: "gmail",
                connected: true,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );

            console.log("✅ Gmail token saved to Firestore");
            resolve();
          } catch (err) {
            console.error("❌ Failed to store Gmail token", err);
            reject(err);
          }
        },
      });

    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}
