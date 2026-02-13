import { VercelRequest, VercelResponse } from '@vercel/node';
import { telegramService } from '../../services/telegram.service';
import { logger } from '../../lib/logger';

/**
 * [POST] /api/v1/telegram/webhook
 * Receives real-time updates from Telegram.
 * Security: Verified via X-Telegram-Bot-Api-Secret-Token header.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).send('Use POST');
    }

    const secretToken = req.headers['x-telegram-bot-api-secret-token'];
    const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!expectedToken || secretToken !== expectedToken) {
        logger.warn('Unauthorized Telegram Webhook attempt', { senderIp: req.headers['x-forwarded-for'] });
        return res.status(401).send('Unauthorized');
    }

    try {
        const update = req.body;
        await telegramService.processWebhookUpdate(update);

        // Always return 200 OK fast to Telegram to prevent retries
        return res.status(200).send('OK');
    } catch (error: any) {
        logger.error('Webhook handler failed', error);
        // Still return 200 to Telegram unless we want them to retry (extreme cases only)
        return res.status(200).send('Error Processed');
    }
}
