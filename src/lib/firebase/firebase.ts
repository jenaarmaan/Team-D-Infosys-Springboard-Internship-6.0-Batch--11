import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { getStorage } from "firebase/storage";

// 1. Precise Config Construction (Strictly using import.meta.env for Vite)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// 2. Production Debugger (Requested to verify Vercel environment injection)
if (import.meta.env.PROD) {
  console.log("[FIREBASE] Production Config Check:", {
    hasApiKey: !!firebaseConfig.apiKey,
    apiKeyLength: firebaseConfig.apiKey?.length || 0,
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain
  });
}

// 3. Prevent Multiple Initializations
const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// 4. Client Proxies
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

export const analytics =
  typeof window !== "undefined"
    ? getAnalytics(firebaseApp)
    : null;

export { firebaseApp, firebaseConfig };