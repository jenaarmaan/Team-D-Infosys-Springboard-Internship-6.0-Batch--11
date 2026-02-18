/**
 * Super-Resilient Firebase Admin Handler
 * Optimized for Vercel Cold Starts.
 */
let firebaseApp: any = null;

export async function getFirebaseAdmin(): Promise<any> {
    const admin = (await import('firebase-admin')).default;

    if (admin.apps.length > 0) {
        const existing = admin.apps.find(a => a?.name === 'govind-prod');
        if (existing) return existing;
    }

    const saKeyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const pId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.projectId || process.env.PROJECT_ID || 'voicemail-f11f3';

    try {
        if (saKeyEnv) {
            try {
                let rawJson = saKeyEnv.trim();
                if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.substring(1, rawJson.length - 1);
                if (rawJson.includes('\\n') && !rawJson.includes('\n')) rawJson = rawJson.replace(/\\n/g, '\n');

                const config = JSON.parse(rawJson);
                if (!config.project_id || !config.private_key) throw new Error("SA_KEY_INVALID");

                firebaseApp = admin.initializeApp({ credential: admin.credential.cert(config) }, 'govind-prod');
                console.log("✅ [FB ADMIN] Booted with Service Account");
                return firebaseApp;
            } catch (pErr: any) {
                console.error("❌ [FB ADMIN] SA Config Parse Error:", pErr.message);
            }
        }

        firebaseApp = admin.initializeApp({ projectId: pId }, 'govind-prod');
        console.log("✅ [FB ADMIN] Booted with ProjectID Fallback");
        return firebaseApp;

    } catch (fatal: any) {
        if (fatal.code === 'app/duplicate-app' || fatal.message?.includes('already exists')) {
            return admin.app('govind-prod');
        }
        if (admin.apps.length > 0) return admin.apps[0]!;
        throw fatal;
    }
}

export const getDb = async () => (await getFirebaseAdmin()).firestore();
export const getAuth = async () => (await getFirebaseAdmin()).auth();
