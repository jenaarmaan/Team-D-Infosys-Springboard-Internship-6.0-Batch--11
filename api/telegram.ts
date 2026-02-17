import axios from 'axios';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../src/server/lib/middleware';
import { telegramService } from '../src/server/services/telegram.service';
import { validator } from '../src/server/lib/validator';

/**
 * --- PRIVATE ACTIONS (Auth Required) ---
 */
const privateActions = withMiddleware(async (req: AuthenticatedRequest, res: VercelResponse) => {
    const { action } = req.query;

    switch (action) {
        case 'send': {
            const { chatId, text } = req.body;
            const validation = validator.validateBody(req.body, ['chatId', 'text']);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'BAD_REQUEST', message: `Missing field: ${validation.missing}` }
                });
            }
            const result = await telegramService.sendMessage(chatId, text, { uid: req.uid, requestId: req.requestId });
            return res.status(200).json({ success: true, data: result, error: null });
        }

        case 'updates': {
            const limit = req.query.limit || req.body?.limit || 50;
            const parsedLimit = parseInt(limit as string);
            const updates = await telegramService.getUpdates(req.uid, isNaN(parsedLimit) ? 50 : parsedLimit);
            return res.status(200).json({ success: true, data: updates, error: null });
        }

        default:
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: `Protected action '${action}' not found` }
            });
    }
});

/**
 * --- PUBLIC ACTIONS (No Auth) ---
 */
async function handlePublic(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;

    // 1. Status Check & Auto-Repair
    if (action === 'status') {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const region = process.env.VERCEL_REGION || 'local';
        let webhookStatus = "unknown";

        if (botToken && region !== 'local') {
            try {
                const host = req.headers.host;
                const webhookUrl = `https://${host}/api/v1/telegram`;
                console.log(`🔧 [TELEGRAM AUTO-REPAIR] Target: ${webhookUrl}`);

                const tgRes = await axios.post(`https://api.telegram.org/bot${botToken}/setWebhook`, {
                    url: webhookUrl,
                    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined
                }, { timeout: 5000 });

                webhookStatus = tgRes.data.ok ? "Success" : `Failed: ${tgRes.data.description}`;
            } catch (err: any) {
                console.error("❌ [TELEGRAM AUTO-REPAIR FAILED]", err.message);
                webhookStatus = `Error: ${err.message}`;
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                hasBotToken: !!botToken,
                region,
                webhookAutoRepairStatus: webhookStatus,
                nodeVersion: process.version
            },
            error: null
        });
    }

    // 2. Incoming Webhook
    if (!action || action === 'webhook') {
        const secretToken = req.headers['x-telegram-bot-api-secret-token'];
        const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;

        if (expectedToken && secretToken !== expectedToken) {
            console.warn('🚫 [TELEGRAM WEBHOOK] Unauthorized mismatch');
            return res.status(401).send('Unauthorized');
        }

        let update = req.body;
        if (typeof update === 'string') {
            try { update = JSON.parse(update); } catch (e) { }
        }

        if (!update || !update.update_id) {
            console.warn("⚠️ [TELEGRAM WEBHOOK] Empty body");
            return res.status(200).send('OK (Empty)');
        }

        await telegramService.processWebhookUpdate(update);
        return res.status(200).send('OK');
    }

    return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Public action '${action}' not found` }
    });
}

/**
 * [POST] /api/v1/telegram
 * Main Handler (Hybrid)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;
    console.log(`📡 [TELEGRAM API] INCOMING -> ${req.method} ${action || 'webhook'}`);

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } });
    }

    try {
        const isPublic = !action || action === 'webhook' || action === 'status';

        if (isPublic) {
            return await handlePublic(req, res);
        } else {
            return await privateActions(req, res);
        }
    } catch (criticalError: any) {
        console.error("🛑 [TELEGRAM API CATASTROPHIC]:", criticalError);
        if (!res.writableEnded) {
            return res.status(500).json({
                success: false,
                data: null,
                error: {
                    code: 'INTERNAL_SERVER_ERROR',
                    message: criticalError.message || 'An unexpected error occurred'
                }
            });
        }
    }
}
