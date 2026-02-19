/**
 * Super-Resilient Firebase Admin Handler
 * Optimized for Vercel Serverless (ESM).
 */
let firebaseApp: any = null;

export async function getFirebaseAdmin(): Promise<any> {
    const appName = 'govind-prod';

    // Check if app is already initialized in the global admin (if loaded)
    try {
        const admin = (await import('firebase-admin')).default;
        const existingApp = admin.apps.find(a => a?.name === appName);
        if (existingApp) return existingApp;

        const saKeyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        const pId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.projectId || process.env.PROJECT_ID || 'voicemail-f11f3';

        if (saKeyEnv) {
            let rawJson = saKeyEnv.trim();
            if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.substring(1, rawJson.length - 1);
            if (rawJson.includes('\\n') && !rawJson.includes('\n')) rawJson = rawJson.replace(/\\n/g, '\n');

            const config = JSON.parse(rawJson);
            firebaseApp = admin.initializeApp({
                credential: admin.credential.cert(config)
            }, appName);
            console.log("✅ [FB ADMIN] Booted with Service Account");
        } else {
            firebaseApp = admin.initializeApp({ projectId: pId }, appName);
            console.log("✅ [FB ADMIN] Booted with ProjectID Fallback");
        }
        return firebaseApp;
    } catch (err: any) {
        // Fallback: Check if we can recover the existing app
        try {
            const admin = (await import('firebase-admin')).default;
            if (err.code === 'app/duplicate-app' || err.message?.includes('already exists')) {
                return admin.app(appName);
            }
            if (admin.apps.length > 0) return admin.apps[0]!;
        } catch (e) { }

        console.error("🛑 [FB ADMIN] Init Failure:", err.message);
        throw err;
    }
}

// 4. Client Proxies
export const getDb = async () => (await getFirebaseAdmin()).firestore();
export const getAuth = async () => (await getFirebaseAdmin()).auth();
