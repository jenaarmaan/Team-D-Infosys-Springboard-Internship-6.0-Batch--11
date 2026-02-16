import * as admin from 'firebase-admin';

/**
 * Cold-Start Optimized Firebase Admin Singleton
 */
export function getFirebaseAdmin() {
    console.log("🔥 FIREBASE ADMIN INIT ATTEMPT");
    if (admin.apps.length > 0) {
        return admin.apps[0]!;
    }

    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccountKey) {
        try {
            const serviceAccount = JSON.parse(serviceAccountKey);
            return admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
            });
        } catch (err) {
            console.error("❌ FAILED TO PARSE FIREBASE_SERVICE_ACCOUNT_KEY JSON");
        }
    }

    // Fallback: Individual Env Variables
    const projectId = process.env.projectId || process.env.VITE_FIREBASE_PROJECT_ID;
    if (projectId) {
        console.warn('[FIREBASE ADMIN] Initializing with Project ID - Service Account Key Recommended');
        return admin.initializeApp({
            projectId: projectId
        });
    }

    console.error("MISSING ENV VARIABLE: FIREBASE_SERVICE_ACCOUNT_KEY or projectId");
    throw new Error("CRITICAL: Firebase Admin configuration is missing.");
}

export const db = admin.apps.length > 0 ? getFirebaseAdmin().firestore() : null;
export const auth = admin.apps.length > 0 ? getFirebaseAdmin().auth() : null;

// Lazy getters to avoid top-level crash
export const getDb = () => getFirebaseAdmin().firestore();
export const getAuth = () => getFirebaseAdmin().auth();
