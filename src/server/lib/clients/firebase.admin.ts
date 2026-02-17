import * as admin from 'firebase-admin';

/**
 * Super-Resilient Firebase Admin Handler
 * Designed to survive cold starts and regional latency in Vercel bom1.
 */
let firebaseApp: admin.app.App | null = null;

export function getFirebaseAdmin(): admin.app.App {
    const apps = admin.apps;
    if (apps.length > 0) return apps[0]!;

    const saKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const pId = process.env.projectId || process.env.VITE_FIREBASE_PROJECT_ID || process.env.PROJECT_ID;

    console.log("🔥 [FB ADMIN] Init attempt", { hasSA: !!saKey, pId, apps: apps.length });

    try {
        if (saKey) {
            try {
                const config = JSON.parse(saKey);
                firebaseApp = admin.initializeApp({
                    credential: admin.credential.cert(config)
                }, 'govind-admin-' + Date.now()); // Unique name to avoid conflicts if re-running
                console.log("✅ [FB ADMIN] Init with SA Success");
                return firebaseApp;
            } catch (pErr: any) {
                console.error("❌ [FB ADMIN] JSON Parse Fail:", pErr.message);
            }
        }

        if (pId) {
            firebaseApp = admin.initializeApp({ projectId: pId }, 'govind-fallback-' + Date.now());
            console.log("✅ [FB ADMIN] Init with ProjectId Success");
            return firebaseApp;
        }

        // ADC Fallback
        firebaseApp = admin.initializeApp();
        return firebaseApp;
    } catch (fatal: any) {
        console.error("🛑 [FB ADMIN] FATAL:", fatal.message);
        if (admin.apps.length > 0) return admin.apps[0]!;
        throw fatal;
    }
}

/**
 * Safe Database Getter: Prevents "Cannot read property of undefined" crashes.
 */
export const getDb = (): admin.firestore.Firestore => {
    try {
        const app = getFirebaseAdmin();
        if (!app) throw new Error("APP_NULL");
        return app.firestore();
    } catch (e: any) {
        console.error("❌ [DB GET FAIL]:", e.message);
        // Return a proxy that logs rather than crashing, but better to throw and catch at handler
        throw e;
    }
};

export const getAuth = (): admin.auth.Auth => {
    try {
        const app = getFirebaseAdmin();
        return app.auth();
    } catch (e: any) {
        throw e;
    }
};
