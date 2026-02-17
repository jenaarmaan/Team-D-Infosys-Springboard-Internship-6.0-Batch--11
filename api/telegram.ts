import { VercelRequest, VercelResponse } from '@vercel/node';
import { TelegramService } from '../src/server/services/telegram.service';
import { withMiddleware } from '../src/server/lib/middleware';

/**
 * Super-Resilient Telegram API Handler
 * Now uses static imports for guaranteed bundling in Vercel.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;
    const host = req.headers.host || 'govindai.vercel.app';
    const protocol = host.includes('localhost') ? 'http' : 'https';

    console.log(`📡 [TG API] -> ${req.method} ${action || 'webhook'} | Origin: ${host}`);

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: { message: 'POST Required' } });

    // 1. STATUS & AUTO-REPAIR
    if (action === 'status') {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
        let repairStatus = "not_triggered";

        if (botToken && !host.includes('localhost')) {
            try {
                const webhookUrl = `${protocol}://${host}/api/v1/telegram`;
                console.log(`🔧 [REPAIR] Setting webhook to ${webhookUrl}`);

                const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: webhookUrl,
                        secret_token: secret || undefined,
                        allowed_updates: ['message', 'edited_message']
                    })
                });
                const data = await tgRes.json();
                repairStatus = data.ok ? "Success" : `Failed: ${data.description}`;
            } catch (err: any) {
                repairStatus = `Error: ${err.message}`;
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                hasBotToken: !!botToken,
                region: process.env.VERCEL_REGION || 'local',
                webhookAutoRepairStatus: repairStatus,
                host
            }
        });
    }

    try {
        const service = new TelegramService();

        // 2. INCOMING WEBHOOK (NO AUTH)
        if (!action || action === 'webhook') {
            const secretToken = req.headers['x-telegram-bot-api-secret-token'];
            const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;

            if (expectedToken) {
                if (secretToken !== expectedToken) {
                    console.warn("🚫 [AUTH] Secret mismatch. Webhook rejected.");
                    return res.status(401).send('Unauthorized');
                }
            }

            const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            if (!update) throw new Error("EMPTY_BODY");

            await service.processWebhookUpdate(update);
            return res.status(200).send('OK');
        }

        // 3. PROTECTED ACTIONS (WITH AUTH)
        return await withMiddleware(async (authReq: any, authRes: VercelResponse) => {
            switch (action) {
                case 'send': {
                    const result = await service.sendMessage(authReq.body.chatId, authReq.body.text);
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
        return res.status(200).json({
            success: false,
            error: {
                message: err.message,
                code: "INTERNAL_CATCH",
                env_check: {
                    hasSA: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
                    hasToken: !!process.env.TELEGRAM_BOT_TOKEN
                }
            }
        });
    }
}
