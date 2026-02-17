import * as admin from 'firebase-admin';

/**
 * Super-Resilient Firebase Admin Handler
 */
let firebaseApp: admin.app.App | null = null;

export function getFirebaseAdmin(): admin.app.App {
    if (admin.apps.length > 0) {
        const existing = admin.apps.find(a => a?.name === 'govind-prod');
        if (existing) return existing;
    }

    const saKeyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const pId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.projectId || process.env.PROJECT_ID || 'voicemail-f11f3';

    try {
        if (saKeyEnv) {
            try {
                // Remove any accidental wrapping quotes or whitespace
                let rawJson = saKeyEnv.trim();
                if (rawJson.startsWith('"') && rawJson.endsWith('"')) {
                    rawJson = rawJson.substring(1, rawJson.length - 1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
                }

                const config = JSON.parse(rawJson);

                // Final validation of key structure
                if (!config.project_id || !config.private_key) {
                    throw new Error("SA_KEY_INVALID_STRUCTURE");
                }

                firebaseApp = admin.initializeApp({
                    credential: admin.credential.cert(config)
                }, 'govind-prod');

                console.log("✅ [FB ADMIN] Service Account Connection Ready");
                return firebaseApp;
            } catch (pErr: any) {
                console.error("❌ [FB ADMIN] SA Config Parse Error:", pErr.message);
            }
        }

        // ProjectID Fallback
        firebaseApp = admin.initializeApp({ projectId: pId }, 'govind-prod');
        console.log("✅ [FB ADMIN] ProjectID Fallback Ready");
        return firebaseApp;

    } catch (fatal: any) {
        if (fatal.code === 'app/duplicate-app' || fatal.message?.includes('already exists')) {
            return admin.app('govind-prod');
        }
        console.error("🛑 [FB ADMIN] FATAL:", fatal.message);
        if (admin.apps.length > 0) return admin.apps[0]!;
        throw fatal;
    }
}

export const getDb = (): admin.firestore.Firestore => getFirebaseAdmin().firestore();
export const getAuth = (): admin.auth.Auth => getFirebaseAdmin().auth();
