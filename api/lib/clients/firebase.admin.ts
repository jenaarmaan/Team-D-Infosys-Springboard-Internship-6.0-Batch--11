import * as admin from 'firebase-admin';

/**
 * Cold-Start Optimized Firebase Admin Singleton
 */
export function getFirebaseAdmin() {
    if (admin.apps.length > 0) {
        return admin.apps[0]!;
    }

    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');

    if (!serviceAccount.project_id) {
        console.warn('[FIREBASE ADMIN] Initializing without Service Account (IAM/Default credentials)');
        return admin.initializeApp();
    }

    return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
    });
}

export const db = getFirebaseAdmin().firestore();
export const auth = getFirebaseAdmin().auth();
