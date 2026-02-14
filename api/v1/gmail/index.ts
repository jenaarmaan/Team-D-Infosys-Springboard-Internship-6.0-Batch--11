import { VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../../lib/middleware';
import { gmailService } from '../../services/gmail.service';
import { validator } from '../../lib/validator';

/**
 * [ALL] /api/v1/gmail
 * Consolidated Gmail API Handler
 * Dispatches to list, get, send, reply, and mark-read based on req.query.action
 */
export default withMiddleware(async (req: AuthenticatedRequest, res: VercelResponse) => {
    const googleToken = req.headers['x-google-token'] as string;
    const { action } = req.query;

    if (!googleToken) {
        return res.status(401).json({
            success: false,
            data: null,
            error: { code: 'GMAIL_AUTH_REQUIRED', message: 'Google OAuth token missing' }
        });
    }

    switch (action) {
        case 'list': {
            const { limit, unread, query } = req.query;
            const emails = await gmailService.listEmails(googleToken, {
                limit: limit ? parseInt(limit as string) : 50,
                unread: unread === 'true',
                q: query as string
            });
            return res.status(200).json({ success: true, data: emails, error: null });
        }

        case 'get': {
            const { id } = req.query;
            if (!id) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'ID missing' } });
            const email = await gmailService.getEmail(googleToken, id as string);
            return res.status(200).json({ success: true, data: email, error: null });
        }

        case 'send': {
            const validation = validator.validateBody(req.body, ['to', 'subject', 'body']);
            if (!validation.valid) {
                return res.status(400).json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: `Missing: ${validation.missing}` } });
            }
            const result = await gmailService.sendEmail(googleToken, req.body);
            return res.status(200).json({ success: true, data: result, error: null });
        }

        case 'reply': {
            const validation = validator.validateBody(req.body, ['threadId', 'to', 'subject', 'body']);
            if (!validation.valid) {
                return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: `Missing: ${validation.missing}` } });
            }
            const result = await gmailService.replyEmail(googleToken, req.body);
            return res.status(200).json({ success: true, data: result, error: null });
        }

        case 'mark-read': {
            const validation = validator.validateBody(req.body, ['messageId']);
            if (!validation.valid) {
                return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: `Missing: ${validation.missing}` } });
            }
            const result = await gmailService.markAsRead(googleToken, req.body.messageId);
            return res.status(200).json({ success: true, data: result, error: null });
        }

        default:
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_ACTION', message: `Action '${action}' is not supported` }
            });
    }
});
