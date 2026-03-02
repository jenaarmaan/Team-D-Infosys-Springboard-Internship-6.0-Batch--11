/**
 * Super-Resilient Firebase Admin Handler
 * Optimized for Vercel Serverless (ESM).
 */
let firebaseApp: any = null;

export async function getFirebaseAdmin(): Promise<any> {
    const appName = 'govind-prod';

    try {
        const admin = (await import('firebase-admin')).default;

        // 1. Check existing
        const apps = admin.apps || [];
        const existing = apps.find(a => a?.name === appName);
        if (existing) return existing;

        const saKeyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        const pId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.projectId || process.env.PROJECT_ID || 'voicemail-f11f3';

        // 2. Initialize
        if (saKeyEnv) {
            try {
                let rawJson = saKeyEnv.trim();
                if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.substring(1, rawJson.length - 1);

                // Handle escaped newlines in Vercel envs
                rawJson = rawJson.replace(/\\n/g, '\n');

                const config = JSON.parse(rawJson);
                const app = admin.initializeApp({
                    credential: admin.credential.cert(config)
                }, appName);
                console.log(`✅ [FB ADMIN] Booted '${appName}' with Service Account`);
                return app;
            } catch (jsonErr: any) {
                console.error("🛑 [FB ADMIN] Service Account JSON invalid:", jsonErr.message);
                // Fallback to project ID below
            }
        }

        const app = admin.initializeApp({ projectId: pId }, appName);
        console.log(`✅ [FB ADMIN] Booted '${appName}' with ProjectID: ${pId}`);
        return app;

    } catch (err: any) {
        console.error("🛑 [FB ADMIN] Critical Failure:", err.message);

        // Final fallback: try to return ANY existing app
        try {
            const admin = (await import('firebase-admin')).default;
            if (admin.apps?.length > 0) return admin.apps[0];
        } catch (e) { }

        throw err;
    }
}

// 4. Client Proxies
export const getDb = async () => (await getFirebaseAdmin()).firestore();
export const getAuth = async () => (await getFirebaseAdmin()).auth();
