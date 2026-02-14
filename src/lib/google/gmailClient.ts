// src/lib/google/gmailClient.ts

import { auth, db } from "../firebase/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Load Google Identity Services (GIS)
 */
function loadGoogleIdentityScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.oauth2) {
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
 * Load Google API client (gapi)
 */
function loadGapiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).gapi) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.defer = true;

    script.onload = () => resolve();
    script.onerror = () => reject("Failed to load gapi script");

    document.body.appendChild(script);
  });
}

/**
 * Get a valid Gmail access token (reuse or refresh)
 */
export async function getValidAccessToken(): Promise<string> {
  // 1. Try LocalStorage (Fastest & Direct from UI flow)
  const localToken = localStorage.getItem("gmail_oauth_token");
  if (localToken) {
    return localToken;
  }
  if (!auth.currentUser) {
    throw new Error("User not authenticated");
  }

  const uid = auth.currentUser.uid;
  const tokenRef = doc(db, "gmail_tokens", uid);
  const snap = await getDoc(tokenRef);

  if (!snap.exists()) {
    throw new Error("Gmail not connected");
  }

  const data = snap.data();
  // Relaxed expiry check (give 5 min buffer)
  const now = Date.now();
  if (data.accessToken && (!data.expiresAt || data.expiresAt > now + 300000)) {
    return data.accessToken;
  }

  // If we have a token but it might be expired, try to return it anyway 
  // if we can't refresh effortlessly. GAPI might still accept it.
  if (data.accessToken) {
    console.warn("[GMAIL] Token might be expired, but attempting to use it anyway.");
    return data.accessToken;
  }

  throw new Error("GMAIL_TOKEN_EXPIRED");
}


/**
 * Get authenticated Gmail API client
 */
export async function getGmailClient(): Promise<any> {
  await loadGapiScript();

  const accessToken = await getValidAccessToken();

  return new Promise((resolve, reject) => {
    (window as any).gapi.load("client", async () => {
      try {
        await (window as any).gapi.client.init({
          discoveryDocs: [
            "https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest",
          ],
        });

        (window as any).gapi.client.setToken({
          access_token: accessToken,
        });

        resolve((window as any).gapi.client.gmail);
      } catch (err) {
        console.error("❌ Failed to initialize Gmail client", err);
        reject(err);
      }
    });
  });
}
