import { VercelRequest, VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../src/server/lib/middleware';
import { TelegramService } from '../src/server/services/telegram.service';
import { validator } from '../src/server/lib/validator';

// Instantiate lazily
const getService = () => new TelegramService();

/**
 * --- PRIVATE ACTIONS ---
 */
const privateActions = withMiddleware(async (req: AuthenticatedRequest, res: VercelResponse) => {
    const { action } = req.query;
    const service = getService();
    try {
        switch (action) {
            case 'send': {
                const { chatId, text } = req.body;
                const validation = validator.validateBody(req.body, ['chatId', 'text']);
                if (!validation.valid) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: `Missing: ${validation.missing}` } });
                const result = await service.sendMessage(chatId, text, { uid: req.uid, requestId: req.requestId });
                return res.status(200).json({ success: true, data: result });
            }
            case 'updates': {
                const limit = parseInt((req.query.limit || req.body?.limit || 50) as string);
                const updates = await service.getUpdates(req.uid, isNaN(limit) ? 50 : limit);
                return res.status(200).json({ success: true, data: updates });
            }
            default:
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Protected action ${action} not found` } });
        }
    } catch (err: any) {
        console.error(`🛑 [PRIVATE FAIL] ${action}:`, err);
        return res.status(500).json({ success: false, error: { code: 'ACTION_FAILED', message: err.message } });
    }
});

/**
 * --- PUBLIC ACTIONS ---
 */
async function handlePublic(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;
    const service = getService();

    if (action === 'status') {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const region = process.env.VERCEL_REGION || 'local';
        let webhookStatus = "unknown";

        // Removed DB check here to speed up status response and avoid timeouts
        if (botToken && region !== 'local') {
            try {
                const host = req.headers.host;
                const webhookUrl = `https://${host}/api/v1/telegram`;
                const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: webhookUrl, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined }),
                    signal: AbortSignal.timeout(5000)
                });
                const data = await tgRes.json();
                webhookStatus = data.ok ? "Success" : `Failed: ${data.description}`;
            } catch (err: any) {
                webhookStatus = `Error: ${err.message}`;
            }
        }

        return res.status(200).json({
            success: true,
            data: { hasBotToken: !!botToken, region, webhookAutoRepairStatus: webhookStatus }
        });
    }

    if (!action || action === 'webhook') {
        const secretToken = req.headers['x-telegram-bot-api-secret-token'];
        const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (expectedToken && secretToken !== expectedToken) return res.status(401).send('Unauthorized');

        try {
            const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            if (!update?.update_id) return res.status(200).send('OK (Empty)');
            await service.processWebhookUpdate(update);
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
    console.log(`📡 [TG API] -> ${req.method} ${action || 'webhook'}`);

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
