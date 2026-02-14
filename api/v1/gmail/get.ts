import { VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../../lib/middleware';
import { gmailService } from '../../services/gmail.service';

/**
 * [GET] /api/v1/gmail/get/[id]
 * Note: Vercel handles dynamic routes if file is named accordingly, 
 * but here we use query param for simplicity in this setup.
 */
export default withMiddleware(async (req: AuthenticatedRequest, res: VercelResponse) => {
    const googleToken = req.headers['x-google-token'] as string;
    const { id } = req.query;

    if (!googleToken) return res.status(401).json({ success: false, error: { code: 'GMAIL_AUTH_REQUIRED' } });
    if (!id) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'ID missing' } });

    const email = await gmailService.getEmail(googleToken, id as string);

    return res.status(200).json({
        success: true,
        data: email,
        error: null
    });
});
