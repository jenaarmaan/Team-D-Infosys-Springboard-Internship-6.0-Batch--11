import { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    const diagnostics: any = {
        timestamp: new Date().toISOString(),
        region: process.env.VERCEL_REGION || 'local',
        env: {
            hasSAKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
            hasProjectId: !!(process.env.projectId || process.env.VITE_FIREBASE_PROJECT_ID || process.env.PROJECT_ID),
            hasBotToken: !!process.env.TELEGRAM_BOT_TOKEN,
            hasWebhookSecret: !!process.env.TELEGRAM_WEBHOOK_SECRET
        },
        firebase: {
            apps: admin.apps.length,
            appsNames: admin.apps.map(a => a?.name)
        }
    };

    try {
        const { getDb } = await import('../src/server/lib/clients/firebase.admin');
        const start = Date.now();
        const db = getDb();

        const testDoc = await Promise.race([
            db.collection('_health_').doc('ping').get(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Firebase Timeout")), 4000))
        ]) as any;

        diagnostics.db = {
            status: "connected",
            latency: Date.now() - start,
            exists: testDoc.exists
        };
    } catch (e: any) {
        diagnostics.db = {
            status: "failed",
            error: e.message,
            stack: e.stack?.split('\n').slice(0, 2).join('\n')
        };
    }

    return res.status(200).json({
        success: diagnostics.db.status === "connected",
        data: diagnostics
    });
}
