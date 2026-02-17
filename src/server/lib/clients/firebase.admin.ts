import * as admin from 'firebase-admin';

/**
 * Hardened Firebase Admin Singleton
 * Optimized for high-latency regions (e.g., bom1) by minimizing init overhead.
 */
let firebaseApp: admin.app.App | null = null;

export function getFirebaseAdmin(): admin.app.App {
    try {
        if (firebaseApp) return firebaseApp;

        // Reuse if already initialized by another module
        if (admin.apps.length > 0) {
            firebaseApp = admin.apps[0]!;
            return firebaseApp;
        }

        const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        const projectIdFromEnv = process.env.projectId ||
            process.env.PROJECT_ID ||
            process.env.FIREBASE_PROJECT_ID ||
            process.env.VITE_FIREBASE_PROJECT_ID ||
            process.env.VITE_PROJECT_ID;

        // Strategy 1: Service Account (Best for Auth/Firestore)
        if (serviceAccountKey) {
            try {
                const serviceAccount = JSON.parse(serviceAccountKey);
                firebaseApp = admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                    // Removed databaseURL to avoid unnecessary RTDB handshakes
                });
                console.log("🔥 [FIREBASE ADMIN] Init: Service Account");
                return firebaseApp;
            } catch (err: any) {
                console.error("❌ [FIREBASE ADMIN] SA Key Init Failed:", err.message);
            }
        }

        // Strategy 2: Project ID (Fallback)
        if (projectIdFromEnv) {
            try {
                firebaseApp = admin.initializeApp({ projectId: projectIdFromEnv });
                console.log("🔥 [FIREBASE ADMIN] Init: ProjectID Fallback");
                return firebaseApp;
            } catch (err: any) {
                console.error("❌ [FIREBASE ADMIN] ProjectID Init Failed:", err.message);
            }
        }

        // Final desperation: Default Init
        try {
            firebaseApp = admin.initializeApp();
            return firebaseApp;
        } catch (e) {
            if (admin.apps.length > 0) return admin.apps[0]!;
            throw new Error("FIREBASE_INIT_FATAL");
        }
    } catch (error: any) {
        console.error("🛑 [FIREBASE ADMIN] Fatal failure:", error.message);
        return (admin.apps[0] || {} as any) as admin.app.App;
    }
}

export const getDb = () => {
    const app = getFirebaseAdmin();
    if (!app || typeof app.firestore !== 'function') {
        console.error("❌ [FIREBASE ADMIN] db() requested but app.firestore is missing");
        throw new Error("FIRESTORE_NOT_AVAILABLE");
    }
    return app.firestore();
};

export const getAuth = () => {
    const app = getFirebaseAdmin();
    if (!app || typeof app.auth !== 'function') {
        console.error("❌ [FIREBASE ADMIN] auth() requested but app.auth is missing");
        throw new Error("AUTH_NOT_AVAILABLE");
    }
    return app.auth();
};
