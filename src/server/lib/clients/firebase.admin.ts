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
    if (!serviceAccountKey) {
        console.error("MISSING ENV VARIABLE: FIREBASE_SERVICE_ACCOUNT_KEY");
        throw new Error("CRITICAL: FIREBASE_SERVICE_ACCOUNT_KEY is undefined.");
    }
    const serviceAccount = JSON.parse(serviceAccountKey);

    if (!serviceAccount.project_id) {
        console.warn('[FIREBASE ADMIN] Initializing without Service Account (IAM/Default credentials)');
        return admin.initializeApp();
    }

    return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
    });
}

export const db = admin.apps.length > 0 ? getFirebaseAdmin().firestore() : null;
export const auth = admin.apps.length > 0 ? getFirebaseAdmin().auth() : null;

// Lazy getters to avoid top-level crash
export const getDb = () => getFirebaseAdmin().firestore();
export const getAuth = () => getFirebaseAdmin().auth();
