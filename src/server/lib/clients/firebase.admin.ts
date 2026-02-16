import admin from 'firebase-admin';

/**
 * Cold-Start Optimized Firebase Admin Singleton
 * Handles multiple initialization strategies for various environments.
 */
export function getFirebaseAdmin() {
    try {
        if (admin.apps.length > 0) {
            return admin.apps[0]!;
        }

        const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        const projectId = process.env.projectId || process.env.PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;

        if (serviceAccountKey) {
            try {
                const serviceAccount = JSON.parse(serviceAccountKey);
                console.log("🔥 [FIREBASE ADMIN] Initializing with Service Account");
                return admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    databaseURL: serviceAccount.project_id ? `https://${serviceAccount.project_id}.firebaseio.com` : undefined
                });
            } catch (err) {
                console.error("❌ [FIREBASE ADMIN] Failed to parse Service Account Key JSON");
            }
        }

        if (projectId) {
            console.warn('⚠️ [FIREBASE ADMIN] Initializing with Project ID fallback');
            return admin.initializeApp({
                projectId: projectId
            });
        }

        // Final fallback: attempt default initialization
        console.warn('⚠️ [FIREBASE ADMIN] No explicit config found, trying default credentials');
        return admin.initializeApp();
    } catch (error: any) {
        console.error("🛑 [FIREBASE ADMIN] Initialization failed", error);
        // We don't throw here to allow the module to load, but callers will fail
        return admin.app(); // Might still return a partially broken instance
    }
}

// Lazy getters to avoid top-level crash during module load
export const getDb = () => getFirebaseAdmin().firestore();
export const getAuth = () => getFirebaseAdmin().auth();
export const db = null; // Deprecated top-level access
export const auth = null; // Deprecated top-level access
