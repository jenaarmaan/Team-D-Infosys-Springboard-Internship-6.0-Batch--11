import { VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../../lib/middleware';
import { gmailService } from '../../services/gmail.service';

/**
 * [GET] /api/v1/gmail/list
 */
export default withMiddleware(async (req: AuthenticatedRequest, res: VercelResponse) => {
    const googleToken = req.headers['x-google-token'] as string;
    if (!googleToken) {
        return res.status(401).json({ success: false, data: null, error: { code: 'GMAIL_AUTH_REQUIRED', message: 'Google OAuth token missing in headers' } });
    }

    const { limit, unread } = req.query;
    const emails = await gmailService.listEmails(googleToken, {
        limit: limit ? parseInt(limit as string) : 50,
        unread: unread === 'true'
    });

    return res.status(200).json({
        success: true,
        data: emails,
        error: null
    });
});
