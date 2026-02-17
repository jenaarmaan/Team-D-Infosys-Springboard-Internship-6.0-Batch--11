import { VercelRequest, VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../src/server/lib/middleware';
import { telegramService } from '../src/server/services/telegram.service';
import { validator } from '../src/server/lib/validator';
import { logger } from '../src/server/lib/logger';

/**
 * [POST] /api/v1/telegram/send_internal
 * Helper handler for authenticated message sending.
 */
const sendHandler = withMiddleware(async (req: AuthenticatedRequest, res: VercelResponse) => {
    const { chatId, text } = req.body;
    const validation = validator.validateBody(req.body, ['chatId', 'text']);
    if (!validation.valid) {
        return res.status(400).json({
            success: false,
            data: null,
            error: { code: 'BAD_REQUEST', message: `Missing field: ${validation.missing}` }
        });
    }

    const result = await telegramService.sendMessage(chatId, text, { uid: req.uid, requestId: req.requestId });

    return res.status(200).json({
        success: true,
        data: result,
        error: null
    });
});

/**
 * [POST] /api/v1/telegram/webhook_internal
 * Helper for Telegram Webhook updates.
 */
async function webhookHandler(req: VercelRequest, res: VercelResponse) {
    const secretToken = req.headers['x-telegram-bot-api-secret-token'];
    const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;

    console.log(`🤖 [TELEGRAM WEBHOOK] Headers:`, JSON.stringify(req.headers));

    if (expectedToken && secretToken !== expectedToken) {
        console.warn('🚫 [TELEGRAM WEBHOOK] Unauthorized: Secret token mismatch');
        return res.status(401).send('Unauthorized');
    }

    try {
        let update = req.body;
        if (typeof update === 'string') {
            try { update = JSON.parse(update); } catch (e) { }
        }

        console.log(`🤖 [TELEGRAM WEBHOOK] Update Body:`, JSON.stringify(update));

        if (!update || !update.update_id) {
            console.warn("⚠️ [TELEGRAM WEBHOOK] Invalid update received (no update_id)");
            return res.status(200).send('Invalid Update');
        }

        await telegramService.processWebhookUpdate(update);
        return res.status(200).send('OK');
    } catch (error: any) {
        console.error('🛑 [TELEGRAM WEBHOOK ERROR]:', error);
        return res.status(200).send(`Error: ${error.message}`);
    }
}

/**
 * [POST] /api/v1/telegram
 * Consolidated Telegram API Handler
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;
    console.log(`🤖 [TELEGRAM API] Method: ${req.method}, Action: ${action || 'webhook'}`);

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' }
        });
    }

    if (action === 'status') {
        const envKeys = Object.keys(process.env).filter(k => k.toLowerCase().includes('telegram'));
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const region = process.env.VERCEL_REGION || 'local';
        let webhookStatus = "unknown";

        // Auto-Repair Check: Try to set webhook if we are on Vercel
        if (botToken && region !== 'local') {
            try {
                const host = req.headers.host;
                const webhookUrl = `https://${host}/api/v1/telegram`;
                console.log(`🔧 [TELEGRAM AUTO-REPAIR] Setting webhook to: ${webhookUrl}`);

                const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: webhookUrl,
                        secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined
                    })
                });
                const data = await res.json();
                webhookStatus = data.ok ? "Success" : `Failed: ${data.description}`;
            } catch (err: any) {
                webhookStatus = `Error: ${err.message}`;
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                hasBotToken: !!botToken,
                hasWebhookSecret: !!process.env.TELEGRAM_WEBHOOK_SECRET,
                botTokenPrefix: botToken ? botToken.substring(0, 5) : 'none',
                region,
                envKeysFound: envKeys,
                webhookAutoRepairStatus: webhookStatus
            },
            error: null
        });
    }

    if (action === 'send') {
        return sendHandler(req, res);
    }

    if (action === 'updates') {
        return withMiddleware(async (authenticatedReq: AuthenticatedRequest, response: VercelResponse) => {
            const limit = req.query.limit || req.body?.limit || 50;
            const parsedLimit = parseInt(limit as string);
            const updates = await telegramService.getUpdates(authenticatedReq.uid, isNaN(parsedLimit) ? 50 : parsedLimit);
            return response.status(200).json({ success: true, data: updates, error: null });
        })(req, res);
    }

    // Default or explicit webhook
    return webhookHandler(req, res);
}
