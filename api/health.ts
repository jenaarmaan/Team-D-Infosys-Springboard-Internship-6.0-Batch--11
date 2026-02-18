import { VercelRequest, VercelResponse } from '@vercel/node';

let firebaseApp: any = null;

async function getFirebaseAdmin() {
    if (firebaseApp) return firebaseApp;
    const admin = (await import('firebase-admin')).default;
    const existing = admin.apps.find(a => a?.name === 'govind-prod');
    if (existing) return existing;

    const saKeyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const pId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.projectId || process.env.PROJECT_ID || 'voicemail-f11f3';

    try {
        if (saKeyEnv) {
            let rawJson = saKeyEnv.trim();
            if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.substring(1, rawJson.length - 1);
            if (rawJson.includes('\\n') && !rawJson.includes('\n')) rawJson = rawJson.replace(/\\n/g, '\n');
            const config = JSON.parse(rawJson);
            firebaseApp = admin.initializeApp({ credential: admin.credential.cert(config) }, 'govind-prod');
        } else {
            firebaseApp = admin.initializeApp({ projectId: pId }, 'govind-prod');
        }
        return firebaseApp;
    } catch {
        if (admin.apps.length > 0) return admin.apps[0];
        throw new Error("FB_INIT_FAILED");
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const diagnostics: any = {
        timestamp: new Date().toISOString(),
        region: process.env.VERCEL_REGION || 'local',
        env: {
            hasSAKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
            hasProjectId: !!(process.env.VITE_FIREBASE_PROJECT_ID || process.env.projectId || process.env.PROJECT_ID),
            hasBotToken: !!process.env.TELEGRAM_BOT_TOKEN
        }
    };

    try {
        const start = Date.now();
        const app = await getFirebaseAdmin();
        const db = app.firestore();

        await Promise.race([
            db.collection('_health_').doc('ping').get(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 8000))
        ]);

        diagnostics.db = { status: "connected", latency: Date.now() - start, app: app.name };
    } catch (e: any) {
        diagnostics.db = { status: "error", message: e.message };
    }

    return res.status(200).json({
        success: !!(diagnostics.db && diagnostics.db.status === "connected"),
        data: diagnostics
    });
}
