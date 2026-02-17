import * as admin from 'firebase-admin';

let firebaseApp: admin.app.App | null = null;

export function getFirebaseAdmin(): admin.app.App {
    const apps = admin.apps;
    const existing = apps.find(a => a?.name === 'govind-prod');
    if (existing) return existing;

    const saKeyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const pId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.projectId || process.env.PROJECT_ID || 'voicemail-f11f3';

    try {
        if (saKeyEnv) {
            try {
                let rawJson = saKeyEnv.trim();
                // Handle double-quoting
                if (rawJson.startsWith('"') && rawJson.endsWith('"')) {
                    rawJson = rawJson.substring(1, rawJson.length - 1);
                }
                // Handle escaped newlines
                if (rawJson.includes('\\n') && !rawJson.includes('\n')) {
                    rawJson = rawJson.replace(/\\n/g, '\n');
                }

                const config = JSON.parse(rawJson);
                firebaseApp = admin.initializeApp({
                    credential: admin.credential.cert(config)
                }, 'govind-prod');
                console.log("✅ [FB ADMIN] Init with SA Success");
                return firebaseApp;
            } catch (pErr: any) {
                console.error("❌ [FB ADMIN] Key Check Failure:", pErr.message);
            }
        }

        firebaseApp = admin.initializeApp({ projectId: pId }, 'govind-prod');
        console.log("✅ [FB ADMIN] Init with ProjectId Success");
        return firebaseApp;
    } catch (fatal: any) {
        if (fatal.code === 'app/duplicate-app') return admin.app('govind-prod');
        if (admin.apps.length > 0) return admin.apps[0]!;
        throw fatal;
    }
}

export const getDb = () => getFirebaseAdmin().firestore();
export const getAuth = () => getFirebaseAdmin().auth();
