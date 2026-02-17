import * as admin from 'firebase-admin';

/**
 * Super-Resilient Firebase Admin Handler
 */
let firebaseApp: admin.app.App | null = null;

export function getFirebaseAdmin(): admin.app.App {
    const apps = admin.apps;

    // Always prioritize an existing 'govind-prod' app to avoid leak & config mismatch
    const existing = apps.find(a => a?.name === 'govind-prod');
    if (existing) return existing;

    const saKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const pId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.projectId || process.env.PROJECT_ID || 'voicemail-f11f3';

    console.log("🔥 [FB ADMIN] Booting govind-prod...", { hasSA: !!saKey, pId });

    try {
        if (saKey) {
            try {
                // Handle possible double-stringified keys or trailing chars
                let cleanKey = saKey.trim();
                const config = JSON.parse(cleanKey);

                firebaseApp = admin.initializeApp({
                    credential: admin.credential.cert(config)
                }, 'govind-prod');

                console.log("✅ [FB ADMIN] Service Account Connection Ready");
                return firebaseApp;
            } catch (pErr: any) {
                console.error("❌ [FB ADMIN] SA Config Parse Error:", pErr.message);
                // Fallback to Project ID if SA fails
            }
        }

        // Fallback to Project ID (Limited functionality - might fail on Auth)
        firebaseApp = admin.initializeApp({ projectId: pId }, 'govind-prod');
        console.log("✅ [FB ADMIN] ProjectID Connection Ready (Fallback)");
        return firebaseApp;

    } catch (fatal: any) {
        if (fatal.code === 'app/duplicate-app' || fatal.message?.includes('already exists')) {
            return admin.app('govind-prod');
        }

        console.error("🛑 [FB ADMIN] FATAL:", fatal.message);

        // Final desperation: Return the default app if it exists
        if (admin.apps.length > 0) return admin.apps[0]!;
        throw fatal;
    }
}

export const getDb = (): admin.firestore.Firestore => getFirebaseAdmin().firestore();
export const getAuth = (): admin.auth.Auth => getFirebaseAdmin().auth();
