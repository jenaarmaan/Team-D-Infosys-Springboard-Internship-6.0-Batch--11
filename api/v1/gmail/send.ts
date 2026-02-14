import { VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../../lib/middleware';
import { gmailService } from '../../services/gmail.service';
import { validator } from '../../lib/validator';

/**
 * [POST] /api/v1/gmail/send
 */
export default withMiddleware(async (req: AuthenticatedRequest, res: VercelResponse) => {
    const googleToken = req.headers['x-google-token'] as string;
    if (!googleToken) {
        return res.status(401).json({ success: false, data: null, error: { code: 'GMAIL_AUTH_REQUIRED', message: 'Google OAuth token missing' } });
    }

    const validation = validator.validateBody(req.body, ['to', 'subject', 'body']);
    if (!validation.valid) {
        return res.status(400).json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: `Missing: ${validation.missing}` } });
    }

    const result = await gmailService.sendEmail(googleToken, req.body);

    return res.status(200).json({
        success: true,
        data: result,
        error: null
    });
});
