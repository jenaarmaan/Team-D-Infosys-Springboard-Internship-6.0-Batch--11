import { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Super-Resilient Telegram API Handler
 * Uses dynamic imports to keep warm start weight low.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;
    console.log(`📡 [TG API] -> ${action || 'webhook'}`);

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: { message: 'POST only' } });

    // 1. FAST STATUS (NO DB)
    if (action === 'status') {
        return res.status(200).json({
            success: true,
            data: {
                hasBotToken: !!process.env.TELEGRAM_BOT_TOKEN,
                region: process.env.VERCEL_REGION || 'local',
                serverTime: new Date().toISOString()
            }
        });
    }

    try {
        const { TelegramService } = await import('../src/server/services/telegram.service');
        const service = new TelegramService();

        // 2. INCOMING WEBHOOK (NO AUTH)
        if (!action || action === 'webhook') {
            const secret = req.headers['x-telegram-bot-api-secret-token'];
            if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
                return res.status(401).send('Unauthorized');
            }
            const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            await service.processWebhookUpdate(update);
            return res.status(200).send('OK');
        }

        // 3. PROTECTED ACTIONS (WITH AUTH)
        const { withMiddleware } = await import('../src/server/lib/middleware');

        return await withMiddleware(async (authReq: any, authRes: VercelResponse) => {
            switch (action) {
                case 'send': {
                    const result = await service.sendMessage(authReq.body.chatId, authReq.body.text, { uid: authReq.uid });
                    return authRes.status(200).json({ success: true, data: result });
                }
                case 'updates': {
                    const updates = await service.getUpdates(authReq.uid);
                    return authRes.status(200).json({ success: true, data: updates });
                }
                default:
                    return authRes.status(404).json({ success: false, error: { message: 'Action not found' } });
            }
        })(req as any, res);

    } catch (err: any) {
        console.error("🛑 [API FATAL]:", err.message);
        return res.status(200).json({ // Keep 200 to bypass Vercel 500 pages but flag failure
            success: false,
            error: {
                message: err.message,
                debug_stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
            }
        });
    }
}
