import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirebaseAdmin } from '../src/server/lib/clients/firebase.admin';

/**
 * Enterprise Health & Diagnostic Endpoint
 * Helps troubleshoot regional latency and credential desync.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    const diagnostics: any = {
        timestamp: new Date().toISOString(),
        region: process.env.VERCEL_REGION || 'local',
        env: {
            hasSAKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
            hasProjectId: !!(process.env.VITE_FIREBASE_PROJECT_ID || process.env.projectId || process.env.PROJECT_ID),
            hasBotToken: !!process.env.TELEGRAM_BOT_TOKEN,
            hasWebhookSecret: !!process.env.TELEGRAM_WEBHOOK_SECRET
        }
    };

    try {
        const start = Date.now();
        const app = getFirebaseAdmin();
        const db = app.firestore();

        // Detailed check on the SA Key if it exists
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            try {
                const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim());
                diagnostics.saKeyCheck = {
                    projectIdMatch: key.project_id === (process.env.VITE_FIREBASE_PROJECT_ID || 'voicemail-f11f3'),
                    hasPrivateKey: !!key.private_key,
                    clientEmail: key.client_email
                };
            } catch (pErr) {
                diagnostics.saKeyCheck = { status: "malformed_json" };
            }
        }

        // Test Firestore
        const testDoc = await Promise.race([
            db.collection('_health_').doc('ping').get(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("FIREBASE_TIMEOUT")), 7000))
        ]) as any;

        diagnostics.db = {
            status: "connected",
            latency: Date.now() - start,
            app: app.name
        };
    } catch (e: any) {
        diagnostics.db = {
            status: "error",
            message: e.message,
            code: e.code,
            stack: e.stack?.split('\n').slice(0, 2).join('\n')
        };
    }

    return res.status(200).json({
        success: !!(diagnostics.db && diagnostics.db.status === "connected"),
        data: diagnostics
    });
}
