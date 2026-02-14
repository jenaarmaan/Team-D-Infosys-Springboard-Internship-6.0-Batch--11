import { VercelRequest, VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../../lib/middleware';
import { telegramService } from '../../services/telegram.service';
import { validator } from '../../lib/validator';
import { logger } from '../../lib/logger';

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

    if (!expectedToken || secretToken !== expectedToken) {
        logger.warn('Unauthorized Telegram Webhook attempt', { senderIp: req.headers['x-forwarded-for'] });
        return res.status(401).send('Unauthorized');
    }

    try {
        const update = req.body;
        await telegramService.processWebhookUpdate(update);
        return res.status(200).send('OK');
    } catch (error: any) {
        logger.error('Webhook handler failed', error);
        return res.status(200).send('Error Processed');
    }
}

/**
 * [POST] /api/v1/telegram
 * Consolidated Telegram API Handler
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' }
        });
    }

    const { action } = req.query;

    // Webhook doesn't have an 'action' query param usually, 
    // it's traditionally at /api/v1/telegram/webhook
    // If action is absent or 'webhook', we default to webhook processing
    // if the secret header is present.

    if (action === 'send') {
        return sendHandler(req, res);
    }

    // Default or explicit webhook
    return webhookHandler(req, res);
}
