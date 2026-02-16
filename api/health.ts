import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../src/server/lib/clients/firebase.admin';

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    let dbStatus = "unchecked";
    try {
        const db = getDb();
        if (db) {
            // Test reachability with a 2-second timeout
            const testPromise = db.collection('_health_check').doc('ping').get();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000));
            await Promise.race([testPromise, timeoutPromise]);
            dbStatus = "connected";
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
            env: {
                hasFirebaseSA: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
                hasGemini: !!(process.env.GEMINI_API_KEY || process.env.apiKey),
                hasTelegram: !!process.env.TELEGRAM_BOT_TOKEN
            }
        },
        error: null
    });
}
