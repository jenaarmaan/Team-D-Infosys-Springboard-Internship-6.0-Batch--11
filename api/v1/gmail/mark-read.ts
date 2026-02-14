import { VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../../lib/middleware';
import { gmailService } from '../../services/gmail.service';
import { validator } from '../../lib/validator';

/**
 * [POST] /api/v1/gmail/mark-read
 */
export default withMiddleware(async (req: AuthenticatedRequest, res: VercelResponse) => {
    const googleToken = req.headers['x-google-token'] as string;
    if (!googleToken) {
        return res.status(401).json({ success: false, error: { code: 'GMAIL_AUTH_REQUIRED' } });
    }

    const validation = validator.validateBody(req.body, ['messageId']);
    if (!validation.valid) {
        return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: `Missing: ${validation.missing}` } });
    }

    const result = await gmailService.markAsRead(googleToken, req.body.messageId);

    return res.status(200).json({
        success: true,
        data: result,
        error: null
    });
});
