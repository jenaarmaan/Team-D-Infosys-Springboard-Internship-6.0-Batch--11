import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../src/server/lib/clients/firebase.admin';

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    let dbStatus = "unchecked";
    let dbMetric = -1;

    try {
        const start = Date.now();
        const db = getDb();
        if (db) {
            // Test reachability with a 5-second timeout
            const testPromise = db.collection('_health_check').doc('ping').get();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Firebase Timeout")), 5000));
            await Promise.race([testPromise, timeoutPromise]);
            dbStatus = "connected";
            dbMetric = Date.now() - start;
        } else {
            dbStatus = "null_instance";
        }
    } catch (e: any) {
        dbStatus = `error: ${e.message}`;
    }

    return res.status(200).json({
        success: true,
        data: {
            status: "ok",
            timestamp: new Date().toISOString(),
            db: dbStatus,
            dbLatencyMs: dbMetric,
            region: process.env.VERCEL_REGION || 'unknown',
            env: {
                hasFirebaseSA: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
                hasWebhookSecret: !!process.env.TELEGRAM_WEBHOOK_SECRET,
                hasBotToken: !!process.env.TELEGRAM_BOT_TOKEN
            }
        },
        error: null
    });
}
