import { VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../../lib/middleware';
import { telegramService } from '../../services/telegram.service';
import { validator } from '../../lib/validator';

/**
 * [POST] /api/v1/telegram/send
 * Authenticated endpoint to send Telegram messages.
 */
export default withMiddleware(async (req: AuthenticatedRequest, res: VercelResponse) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, data: null, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } });
    }

    const { chatId, text } = req.body;
    const validation = validator.validateBody(req.body, ['chatId', 'text']);
    if (!validation.valid) {
        return res.status(400).json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: `Missing field: ${validation.missing}` } });
    }

    const result = await telegramService.sendMessage(chatId, text, { uid: req.uid, requestId: req.requestId });

    return res.status(200).json({
        success: true,
        data: result,
        error: null
    });
});
