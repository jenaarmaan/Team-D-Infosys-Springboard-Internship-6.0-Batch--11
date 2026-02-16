import * as admin from 'firebase-admin';

/**
 * Cold-Start Optimized Firebase Admin Singleton
 */
let firebaseApp: admin.app.App | null = null;

export function getFirebaseAdmin() {
    try {
        if (firebaseApp) return firebaseApp;

        if (admin.apps.length > 0) {
            firebaseApp = admin.apps[0]!;
            return firebaseApp;
        }

        const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        const projectId = process.env.projectId ||
            process.env.PROJECT_ID ||
            process.env.FIREBASE_PROJECT_ID ||
            process.env.VITE_FIREBASE_PROJECT_ID;

        console.log("🔥 [FIREBASE ADMIN] Initializing Singleton", {
            hasSaKey: !!serviceAccountKey,
            projectId: projectId
        });

        if (serviceAccountKey) {
            try {
                const serviceAccount = JSON.parse(serviceAccountKey);
                firebaseApp = admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    databaseURL: serviceAccount.project_id ? `https://${serviceAccount.project_id}.firebaseio.com` : undefined
                });
                return firebaseApp;
            } catch (err) {
                console.error("❌ [FIREBASE ADMIN] SA Key Parse Error");
            }
        }

        if (projectId) {
            firebaseApp = admin.initializeApp({ projectId });
            return firebaseApp;
        }

        firebaseApp = admin.initializeApp();
        return firebaseApp;
    } catch (error: any) {
        console.error("🛑 [FIREBASE ADMIN] Fatal Init Error", error.message);
        throw error;
    }
}

export const getDb = () => getFirebaseAdmin().firestore();
export const getAuth = () => getFirebaseAdmin().auth();
export const db = null;
export const auth = null;
