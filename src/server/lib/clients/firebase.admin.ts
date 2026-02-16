import * as admin from 'firebase-admin';

/**
 * Cold-Start Optimized Firebase Admin Singleton
 */
export function getFirebaseAdmin() {
    try {
        if (admin.apps.length > 0) {
            return admin.apps[0]!;
        }

        const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        const projectId = process.env.projectId ||
            process.env.PROJECT_ID ||
            process.env.FIREBASE_PROJECT_ID ||
            process.env.VITE_FIREBASE_PROJECT_ID;

        console.log("🔥 [FIREBASE ADMIN] Attempting init", {
            hasSaKey: !!serviceAccountKey,
            projectId: projectId,
            nodeEnv: process.env.NODE_ENV
        });

        if (serviceAccountKey) {
            try {
                const serviceAccount = JSON.parse(serviceAccountKey);
                return admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    databaseURL: serviceAccount.project_id ? `https://${serviceAccount.project_id}.firebaseio.com` : undefined
                });
            } catch (err) {
                console.error("❌ [FIREBASE ADMIN] SA Key Parse Error");
            }
        }

        if (projectId) {
            return admin.initializeApp({
                projectId: projectId
            });
        }

        // Final attempt without specific config
        return admin.initializeApp();
    } catch (error: any) {
        console.error("🛑 [FIREBASE ADMIN] Fatal Init Error", error.message);
        throw error; // Re-throw so the middleware can catch it and return 500 JSON
    }
}

export const getDb = () => getFirebaseAdmin().firestore();
export const getAuth = () => getFirebaseAdmin().auth();
export const db = null;
export const auth = null;
