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
                let rawJson = saKeyEnv.trim();

                // 1. Handle double-quoting if Vercel wrapped the whole thing in quotes
                if (rawJson.startsWith('"') && rawJson.endsWith('"')) {
                    rawJson = rawJson.substring(1, rawJson.length - 1);
                }

                // 2. Handle escaped newlines (\n) vs literal newlines
                // If it contains literal \n characters but not actual newlines, fix them
                if (rawJson.includes('\\n') && !rawJson.includes('\n')) {
                    rawJson = rawJson.replace(/\\n/g, '\n');
                }

                const config = JSON.parse(rawJson);

                if (!config.project_id || !config.private_key) {
                    throw new Error("SA_KEY_PARSE_RESULT_INVALID");
                }

                firebaseApp = admin.initializeApp({
                    credential: admin.credential.cert(config)
                }, 'govind-prod');

                console.log("✅ [FB ADMIN] Booted with Service Account");
                return firebaseApp;
            } catch (pErr: any) {
                console.error("❌ [FB ADMIN] SA Config Parse Error:", pErr.message);
                // Continue to pId fallback
            }
        }

        // ProjectID Fallback (ADC)
        firebaseApp = admin.initializeApp({ projectId: pId }, 'govind-prod');
        console.log("✅ [FB ADMIN] Booted with ProjectID Fallback");
        return firebaseApp;

    } catch (fatal: any) {
        if (fatal.code === 'app/duplicate-app' || fatal.message?.includes('already exists')) {
            return admin.app('govind-prod');
        }

        console.error("🛑 [FB ADMIN] Fatal init error:", fatal.message);

        // Final fallback: return the default app if initialized, else re-throw
        if (admin.apps.length > 0) return admin.apps[0]!;
        throw fatal;
    }
}

export const getDb = (): admin.firestore.Firestore => getFirebaseAdmin().firestore();
export const getAuth = (): admin.auth.Auth => getFirebaseAdmin().auth();
