/**
 * Super-Resilient Firebase Admin Handler
 * Optimized for Vercel Cold Starts.
 */
import * as admin from 'firebase-admin';

let firebaseApp: admin.app.App | null = null;

export async function getFirebaseAdmin(): Promise<admin.app.App> {
    if (admin.apps.length > 0) {
        const existing = admin.apps.find(a => a?.name === 'govind-prod');
        if (existing) return existing;
        return admin.apps[0]!;
    }

    const saKeyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const pId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.projectId || process.env.PROJECT_ID || 'voicemail-f11f3';

    try {
        if (saKeyEnv) {
            let rawJson = saKeyEnv.trim();
            if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.substring(1, rawJson.length - 1);
            if (rawJson.includes('\\n') && !rawJson.includes('\n')) rawJson = rawJson.replace(/\\n/g, '\n');

            const config = JSON.parse(rawJson);
            firebaseApp = admin.initializeApp({ credential: admin.credential.cert(config) }, 'govind-prod');
            console.log("✅ [FB ADMIN] Booted with Service Account");
        } else {
            firebaseApp = admin.initializeApp({ projectId: pId }, 'govind-prod');
            console.log("✅ [FB ADMIN] Booted with ProjectID Fallback");
        }
        return firebaseApp;
    } catch (err: any) {
        if (err.code === 'app/duplicate-app' || err.message?.includes('already exists')) {
            return admin.app('govind-prod');
        }
        console.error("🛑 [FB ADMIN] Fatal init error:", err.message);
        if (admin.apps.length > 0) return admin.apps[0]!;
        throw err;
    }
}

export const getDb = async () => (await getFirebaseAdmin()).firestore();
export const getAuth = async () => (await getFirebaseAdmin()).auth();
