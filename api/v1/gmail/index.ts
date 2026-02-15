import { VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../../lib/middleware';
import { gmailService } from '../../services/gmail.service';
import { tokenService } from '../../services/token.service';
import { validator } from '../../lib/validator';
import { logger } from '../../lib/logger';

/**
 * [ALL] /api/v1/gmail
 * Consolidated Gmail API Handler
 * Dispatches to list, get, send, reply, and mark-read based on req.query.action
 */
export default withMiddleware(async (req: AuthenticatedRequest, res: VercelResponse) => {
    const { action } = req.query;
    const uid = req.uid;

    try {
        // 1. Securely retrieve/refresh token from Firestore (Point 6)
        // Note: x-google-token fallback removed for security; server is the source of truth.
        const accessToken = await tokenService.getValidToken(uid);

        // 2. Logging required for audit (Point 7)
        console.log("Using access token:", accessToken?.slice(0, 10));

        switch (action) {
            case 'list': {
                const { limit, unread, query } = req.query;
                const emails = await gmailService.listEmails(accessToken, {
                    limit: limit ? parseInt(limit as string) : 50,
                    unread: unread === 'true',
                    q: query as string
                });
                return res.status(200).json({ success: true, data: emails, error: null });
            }

            case 'get': {
                const { id } = req.query;
                if (!id) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'ID missing' } });
                const email = await gmailService.getEmail(accessToken, id as string);
                return res.status(200).json({ success: true, data: email, error: null });
            }

            case 'send': {
                const validation = validator.validateBody(req.body, ['to', 'subject', 'body']);
                if (!validation.valid) {
                    return res.status(400).json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: `Missing: ${validation.missing}` } });
                }
                const result = await gmailService.sendEmail(accessToken, req.body);
                return res.status(200).json({ success: true, data: result, error: null });
            }

            case 'reply': {
                const validation = validator.validateBody(req.body, ['threadId', 'to', 'subject', 'body']);
                if (!validation.valid) {
                    return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: `Missing: ${validation.missing}` } });
                }
                const result = await gmailService.replyEmail(accessToken, req.body);
                return res.status(200).json({ success: true, data: result, error: null });
            }

            case 'mark-read': {
                const validation = validator.validateBody(req.body, ['messageId']);
                if (!validation.valid) {
                    return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: `Missing: ${validation.missing}` } });
                }
                const result = await gmailService.markAsRead(accessToken, req.body.messageId);
                return res.status(200).json({ success: true, data: result, error: null });
            }

            default:
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_ACTION', message: `Action '${action}' is not supported` }
                });
        }
    } catch (error: any) {
        // Point 3 & 4
        console.error("GMAIL SERVER ERROR:", error);
        logger.error("GMAIL_API_FATAL", error, { uid, action });

        return res.status(error.status || 500).json({
            success: false,
            error: error.message || "An unexpected error occurred during Gmail operation"
        });
    }
});
