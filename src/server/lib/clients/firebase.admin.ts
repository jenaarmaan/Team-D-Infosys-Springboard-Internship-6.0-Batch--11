import * as admin from 'firebase-admin';

/**
 * Cold-Start Optimized Firebase Admin Singleton
 * Hardened for Vercel Serverless (high-latency regions like bom1)
 */
let firebaseApp: admin.app.App | null = null;

export function getFirebaseAdmin(): admin.app.App {
    try {
        if (firebaseApp) return firebaseApp;

        if (admin.apps.length > 0) {
            firebaseApp = admin.apps[0]!;
            console.log("🔥 [FIREBASE ADMIN] Reusing existing app instance. Total Apps:", admin.apps.length);
            return firebaseApp;
        }

        const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        const projectIdFromEnv = process.env.projectId ||
            process.env.PROJECT_ID ||
            process.env.FIREBASE_PROJECT_ID ||
            process.env.VITE_FIREBASE_PROJECT_ID;

        console.log("🔥 [FIREBASE ADMIN] Initializing Singleton (Production/Serverless)", {
            hasSaKey: !!serviceAccountKey,
            providedProjectId: projectIdFromEnv,
            region: process.env.VERCEL_REGION || 'local'
        });

        if (serviceAccountKey) {
            try {
                const serviceAccount = JSON.parse(serviceAccountKey);
                console.log("🔥 [FIREBASE ADMIN] Using Service Account for Project:", serviceAccount.project_id);
                firebaseApp = admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    databaseURL: serviceAccount.project_id ? `https://${serviceAccount.project_id}.firebaseio.com` : undefined
                });
                return firebaseApp;
            } catch (err: any) {
                console.error("❌ [FIREBASE ADMIN] SA Key Parse/Init Error:", err.message);
            }
        }

        if (projectIdFromEnv) {
            console.log("🔥 [FIREBASE ADMIN] Falling back to direct projectId initialization.");
            firebaseApp = admin.initializeApp({ projectId: projectIdFromEnv });
            return firebaseApp;
        }

        console.warn("⚠️ [FIREBASE ADMIN] No explicit config found, attempting default (ADC) initialization.");
        firebaseApp = admin.initializeApp();
        return firebaseApp;
    } catch (error: any) {
        console.error("🛑 [FIREBASE ADMIN] Fatal Fallback Recovery:", error.message);
        // Emergency recovery: return existing or try one last time
        return (admin.apps[0] || admin.initializeApp()) as admin.app.App;
    }
}

export const getDb = () => getFirebaseAdmin().firestore();
export const getAuth = () => getFirebaseAdmin().auth();
export const db = null;
export const auth = null;
