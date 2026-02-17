/**
 * SUPER-LAZY FIREBASE ADMIN
 * Designed to prevent memory/timeout crashes in 'bom1'.
 */
let firebaseApp: any = null;

export async function getFirebaseAdmin() {
    // 1. Return existing
    if (firebaseApp) return firebaseApp;

    // 2. Dynamic Import admin SDK (Heavy)
    const admin = (await import('firebase-admin')).default;

    // 3. Check for existing apps (prevent duplication crashes)
    const apps = admin.apps;
    const existing = apps.find(a => a?.name === 'govind-prod');
    if (existing) {
        firebaseApp = existing;
        return firebaseApp;
    }

    // 4. Resolve Credentials
    const saKeyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const pId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.projectId || process.env.PROJECT_ID || 'voicemail-f11f3';

    try {
        if (saKeyEnv) {
            let rawJson = saKeyEnv.trim();
            // Handle Vercel wrapping quotes
            if (rawJson.startsWith('"') && rawJson.endsWith('"')) {
                rawJson = rawJson.substring(1, rawJson.length - 1);
            }
            // Handle escaped newlines from dashboard
            if (rawJson.includes('\\n') && !rawJson.includes('\n')) {
                rawJson = rawJson.replace(/\\n/g, '\n');
            }

            const config = JSON.parse(rawJson);
            firebaseApp = admin.initializeApp({
                credential: admin.credential.cert(config)
            }, 'govind-prod');

            console.log("✅ [FB ADMIN] Booted with Service Account");
        } else {
            firebaseApp = admin.initializeApp({ projectId: pId }, 'govind-prod');
            console.log("✅ [FB ADMIN] Booted with Project ID Fallback");
        }

        return firebaseApp;
    } catch (fatal: any) {
        if (fatal.code === 'app/duplicate-app') return admin.app('govind-prod');
        // Final fallback to default app if available
        if (admin.apps.length > 0) return admin.apps[0];
        throw fatal;
    }
}

export const getDb = async () => (await getFirebaseAdmin()).firestore();
export const getAuth = async () => (await getFirebaseAdmin()).auth();
