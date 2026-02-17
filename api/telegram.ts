import { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * ULTRA-RESILIENT TELEGRAM HANDLER
 * Focused on surviving 'bom1' regional constraints.
 * No top-level heavy imports to prevent Boot-Time 500s.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;
    const host = req.headers.host || 'govindai.vercel.app';
    const protocol = host.includes('localhost') ? 'http' : 'https';

    console.log(`📡 [TG API] Action: ${action || 'webhook'} | Region: ${process.env.VERCEL_REGION || 'local'}`);

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST Only' });

    // ⚡ ACTION: STATUS (Ultra-Fast, No Dependencies)
    if (action === 'status') {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
        let repairStatus = "not_checked";

        // Only repair if we have a token and aren't local
        if (botToken && !host.includes('localhost')) {
            try {
                const webhookUrl = `${protocol}://${host}/api/v1/telegram`;
                const repairRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: webhookUrl,
                        secret_token: secret || undefined,
                        allowed_updates: ['message', 'edited_message']
                    })
                });
                const repairData = await repairRes.json();
                repairStatus = repairData.ok ? "Fixed" : `Fail: ${repairData.description}`;
            } catch (e: any) {
                repairStatus = `Error: ${e.message}`;
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                hasBotToken: !!botToken,
                region: process.env.VERCEL_REGION || 'local',
                webhookAutoRepairStatus: repairStatus,
                nodeVersion: process.version
            }
        });
    }

    // 🛡️ ACTION: WEBHOOK (Public Entry)
    if (!action || action === 'webhook') {
        try {
            const secretToken = req.headers['x-telegram-bot-api-secret-token'];
            const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;

            if (expectedToken && secretToken !== expectedToken) {
                console.warn("🚫 [AUTH] Secret mismatch");
                return res.status(401).send('Unauthorized');
            }

            // Lazy Load Service only when needed
            const { TelegramService } = await import('./_lib/telegram-service');
            const service = new TelegramService();

            const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            await service.processWebhookUpdate(update);
            return res.status(200).send('OK');
        } catch (err: any) {
            console.error("🛑 [WEBHOOK CRASH]:", err.message);
            return res.status(200).send('ERR_PROCESSED');
        }
    }

    // 🔐 PROTECTED ACTIONS (Send / Updates)
    try {
        const { withMiddleware } = await import('./_lib/middleware');
        const { TelegramService } = await import('./_lib/telegram-service');
        const service = new TelegramService();

        return await withMiddleware(async (authReq: any, authRes: VercelResponse) => {
            switch (action) {
                case 'send':
                    const sRes = await service.sendMessage(authReq.body.chatId, authReq.body.text);
                    return authRes.status(200).json({ success: true, data: sRes });
                case 'updates':
                    const uRes = await service.getUpdates(authReq.uid);
                    return authRes.status(200).json({ success: true, data: uRes });
                default:
                    return authRes.status(404).json({ success: false, error: 'Unknown Action' });
            }
        })(req as any, res);
    } catch (err: any) {
        console.error("🛑 [PRIVATE API CRASH]:", err.message);
        return res.status(200).json({
            success: false,
            error: { message: err.message, code: 'INVOCATION_FAILED' }
        });
    }
}
