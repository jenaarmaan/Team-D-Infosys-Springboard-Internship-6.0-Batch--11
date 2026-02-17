import { VercelRequest, VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../src/server/lib/middleware';
import { telegramService } from '../src/server/services/telegram.service';
import { validator } from '../src/server/lib/validator';

/**
 * [POST] /api/v1/telegram
 * Core Handler for all Telegram operations.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    const startTime = Date.now();
    const { action } = req.query;

    console.log(`📡 [TELEGRAM API] INCOMING -> Method: ${req.method}, Action: ${action || 'webhook'}`);

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' }
        });
    }

    try {
        // --- PUBLIC ACTIONS (No Auth Required) ---

        // 1. Diagnostic Status
        if (action === 'status') {
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
            const region = process.env.VERCEL_REGION || 'local';
            let webhookStatus = "unknown";

            if (botToken && region !== 'local') {
                try {
                    const host = req.headers.host;
                    const webhookUrl = `https://${host}/api/v1/telegram`;
                    console.log(`🔧 [TELEGRAM AUTO-REPAIR] Setting webhook to: ${webhookUrl}`);

                    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            url: webhookUrl,
                            secret_token: webhookSecret || undefined
                        })
                    });
                    const data = await tgRes.json();
                    webhookStatus = data.ok ? "Success" : `Failed: ${data.description}`;
                } catch (err: any) {
                    console.error("❌ [TELEGRAM AUTO-REPAIR FAILED]", err.message);
                    webhookStatus = `Error: ${err.message}`;
                }
            }

            return res.status(200).json({
                success: true,
                data: {
                    hasBotToken: !!botToken,
                    hasWebhookSecret: !!webhookSecret,
                    botTokenPrefix: botToken ? botToken.substring(0, 5) : 'none',
                    region,
                    webhookAutoRepairStatus: webhookStatus
                },
                error: null
            });
        }

        // 2. Incoming Webhook (Telegram -> Our Server)
        if (!action || action === 'webhook') {
            const secretToken = req.headers['x-telegram-bot-api-secret-token'];
            const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;

            if (expectedToken && secretToken !== expectedToken) {
                console.warn('🚫 [TELEGRAM WEBHOOK] Unauthorized: Secret token mismatch');
                return res.status(401).send('Unauthorized');
            }

            let update = req.body;
            if (typeof update === 'string') {
                try { update = JSON.parse(update); } catch (e) { }
            }

            if (!update || !update.update_id) {
                console.warn("⚠️ [TELEGRAM WEBHOOK] Empty or invalid update body");
                return res.status(200).send('OK (Empty)');
            }

            await telegramService.processWebhookUpdate(update);
            return res.status(200).send('OK');
        }

        // --- PROTECTED ACTIONS (Requires Firebase Auth) ---

        // 3. Authenticated Send
        if (action === 'send') {
            return withMiddleware(async (authReq: AuthenticatedRequest, authRes: VercelResponse) => {
                const { chatId, text } = authReq.body;
                const validation = validator.validateBody(authReq.body, ['chatId', 'text']);
                if (!validation.valid) {
                    return authRes.status(400).json({
                        success: false,
                        error: { code: 'BAD_REQUEST', message: `Missing field: ${validation.missing}` }
                    });
                }
                const result = await telegramService.sendMessage(chatId, text, { uid: authReq.uid, requestId: authReq.requestId });
                return authRes.status(200).json({ success: true, data: result, error: null });
            })(req, res);
        }

        // 4. Historical Update Sync
        if (action === 'updates') {
            return withMiddleware(async (authReq: AuthenticatedRequest, authRes: VercelResponse) => {
                const limit = authReq.query.limit || authReq.body?.limit || 50;
                const parsedLimit = parseInt(limit as string);
                const updates = await telegramService.getUpdates(authReq.uid, isNaN(parsedLimit) ? 50 : parsedLimit);
                return authRes.status(200).json({ success: true, data: updates, error: null });
            })(req, res);
        }

        // Catch-all for unknown actions
        return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: `Action '${action}' not found` }
        });

    } catch (criticalError: any) {
        console.error("🛑 [TELEGRAM API CRITICAL FAILURE]:", criticalError);
        return res.status(500).json({
            success: false,
            data: null,
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: criticalError.message || 'An unexpected error occurred at the API level'
            }
        });
    }
}
