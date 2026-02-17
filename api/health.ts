import { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Enterprise Health & Diagnostic Endpoint
 * No top-level imports to prevent 500s.
 */
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
        const { getFirebaseAdmin } = await import('./_lib/firebase');
        const start = Date.now();
        const app = await getFirebaseAdmin();
        const db = app.firestore();

        // Check if database is reachable
        const testDoc = await Promise.race([
            db.collection('_health_').doc('ping').get(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("FIREBASE_TIMEOUT")), 8000))
        ]) as any;

        diagnostics.db = {
            status: "connected",
            latency: Date.now() - start,
            app: app.name
        };
    } catch (e: any) {
        diagnostics.db = { status: "error", message: e.message, code: e.code };
    }

    return res.status(200).json({
        success: !!(diagnostics.db && diagnostics.db.status === "connected"),
        data: diagnostics
    });
}
