import * as admin from 'firebase-admin';

/**
 * Super-Resilient Firebase Admin Handler
 * Optimized for high-latency regions (e.g., bom1).
 */
let firebaseApp: admin.app.App | null = null;

export function getFirebaseAdmin(): admin.app.App {
    // 1. Check if already initialized in this request context
    if (firebaseApp) return firebaseApp;

    // 2. Check global apps array
    if (admin.apps.length > 0) {
        // Look for our specific named app first to ensure we have the right credentials
        const existingApp = admin.apps.find(a => a?.name === 'govind-prod');
        if (existingApp) {
            firebaseApp = existingApp;
            return firebaseApp;
        }

        // If there's an app but it's not ours, we might be sharing a process.
        // If it's the default app, we might try to reuse it if it was initialized correctly.
        // However, to be safe in serverless, we'll try to initialize ours if not present.
    }

    const saKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const pId = process.env.projectId || process.env.VITE_FIREBASE_PROJECT_ID || process.env.PROJECT_ID;

    console.log("🔥 [FB ADMIN] Booting...", { hasSA: !!saKey, pId });

    try {
        if (saKey) {
            try {
                const config = JSON.parse(saKey);
                firebaseApp = admin.initializeApp({
                    credential: admin.credential.cert(config)
                }, 'govind-prod');
                console.log("✅ [FB ADMIN] Service Account Connection Ready");
                return firebaseApp;
            } catch (pErr: any) {
                console.error("❌ [FB ADMIN] SA Config Parse Error:", pErr.message);
            }
        }

        if (pId) {
            firebaseApp = admin.initializeApp({ projectId: pId }, 'govind-prod');
            console.log("✅ [FB ADMIN] ProjectID Connection Ready (Limited)");
            return firebaseApp;
        }

        // Fallback to default
        if (admin.apps.length > 0) return admin.apps[0]!;
        firebaseApp = admin.initializeApp();
        return firebaseApp;
    } catch (fatal: any) {
        // If "already exists" error, just find it
        if (fatal.code === 'app/duplicate-app' || fatal.message?.includes('already exists')) {
            const app = admin.apps.find(a => a?.name === 'govind-prod') || admin.apps[0]!;
            firebaseApp = app;
            return app;
        }
        console.error("🛑 [FB ADMIN] Fatal Error during init:", fatal.message);
        throw fatal;
    }
}

export const getDb = (): admin.firestore.Firestore => getFirebaseAdmin().firestore();
export const getAuth = (): admin.auth.Auth => getFirebaseAdmin().auth();
