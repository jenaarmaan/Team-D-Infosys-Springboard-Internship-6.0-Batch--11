import { VercelRequest, VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../src/server/lib/middleware';
import { telegramService } from '../src/server/services/telegram.service';
import { validator } from '../src/server/lib/validator';
import { getDb } from '../src/server/lib/clients/firebase.admin';

/**
 * --- PRIVATE ACTIONS ---
 */
const privateActions = withMiddleware(async (req: AuthenticatedRequest, res: VercelResponse) => {
    const { action } = req.query;
    try {
        switch (action) {
            case 'send': {
                const { chatId, text } = req.body;
                const validation = validator.validateBody(req.body, ['chatId', 'text']);
                if (!validation.valid) {
                    return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: `Missing: ${validation.missing}` } });
                }
                const result = await telegramService.sendMessage(chatId, text, { uid: req.uid, requestId: req.requestId });
                return res.status(200).json({ success: true, data: result });
            }
            case 'updates': {
                const limit = req.query.limit || req.body?.limit || 50;
                const parsedLimit = parseInt(limit as string);
                const updates = await telegramService.getUpdates(req.uid, isNaN(parsedLimit) ? 50 : parsedLimit);
                return res.status(200).json({ success: true, data: updates });
            }
            default:
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Protected action ${action} not found` } });
        }
    } catch (err: any) {
        console.error(`🛑 [PRIVATE ACTION FAIL] ${action}:`, err);
        return res.status(500).json({ success: false, error: { code: 'ACTION_FAILED', message: err.message } });
    }
});

/**
 * --- PUBLIC ACTIONS ---
 */
async function handlePublic(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;

    if (action === 'status') {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const region = process.env.VERCEL_REGION || 'local';
        let webhookStatus = "unknown";
        let dbStatus = "pending";

        // 1. Check DB
        try {
            const db = getDb();
            const start = Date.now();
            const testPromise = db.collection('_health_').doc('ping').get();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000));
            await Promise.race([testPromise, timeoutPromise]);
            dbStatus = `OK (${Date.now() - start}ms)`;
        } catch (e: any) {
            dbStatus = `ERROR: ${e.message}`;
        }

        // 2. Auto-Repair Webhook (Native Fetch)
        if (botToken && region !== 'local') {
            try {
                const host = req.headers.host;
                const webhookUrl = `https://${host}/api/v1/telegram`;
                const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: webhookUrl, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined })
                });
                const data = await tgRes.json();
                webhookStatus = data.ok ? "Success" : `Failed: ${data.description}`;
            } catch (err: any) {
                webhookStatus = `Error: ${err.message}`;
            }
        }

        return res.status(200).json({
            success: true,
            data: { hasBotToken: !!botToken, region, webhookAutoRepairStatus: webhookStatus, dbStatus }
        });
    }

    if (!action || action === 'webhook') {
        const secretToken = req.headers['x-telegram-bot-api-secret-token'];
        const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (expectedToken && secretToken !== expectedToken) return res.status(401).send('Unauthorized');

        try {
            const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            if (!update?.update_id) return res.status(200).send('OK (Empty)');
            await telegramService.processWebhookUpdate(update);
            return res.status(200).send('OK');
        } catch (err: any) {
            console.error('🛑 [WEBHOOK FAIL]:', err.message);
            return res.status(200).send(`Processed with Warning: ${err.message}`);
        }
    }

    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Action not found' } });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;
    console.log(`📡 [TG API] -> INCOMING -> ${req.method} ${action || 'webhook'}`);

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Post Required' } });

    try {
        const isPublic = !action || action === 'webhook' || action === 'status';
        if (isPublic) {
            return await handlePublic(req, res);
        } else {
            return await privateActions(req, res);
        }
    } catch (criticalError: any) {
        console.error("🛑 [API CATASTROPHIC]:", criticalError);
        if (!res.writableEnded) {
            return res.status(500).json({ success: false, error: { code: 'FATAL', message: criticalError.message } });
        }
    }
}
