import { VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../src/server/lib/middleware';
import { tokenService } from '../src/server/services/token.service';
import { gmailService } from '../src/server/services/gmail.service';

/**
 * [ALL] /api/v1/gmail
 * Consolidated Gmail API Handler - Standardized Version
 */
export default withMiddleware(async (req: AuthenticatedRequest, res: VercelResponse) => {
    try {
        const { action } = req.query;
        const uid = req.uid;

        console.log(`📨 [GMAIL API] Action: ${action}, UID: ${uid}`);

        console.log(`🔑 [GMAIL API] Fetching token for UID: ${uid}`);
        const accessToken = await tokenService.getValidToken(uid);
        console.log(`✅ [GMAIL API] Token acquired.`);

        switch (action) {
            case 'list': {
                const { limit, unread, query } = req.query;
                const requestedLimit = limit ? parseInt(limit as string) : 20;
                const safeLimit = Math.min(requestedLimit, 50);

                const emails = await gmailService.listEmails(accessToken, {
                    limit: safeLimit,
                    unread: unread === 'true',
                    q: query as string
                });

                return res.status(200).json({
                    success: true,
                    data: { messages: emails || [] },
                    messages: emails || []
                });
            }

            case 'get': {
                const { id } = req.query;
                if (!id) throw new Error('Email ID missing');
                const email = await gmailService.getEmail(accessToken, id as string);
                return res.status(200).json({
                    success: true,
                    data: { messages: email ? [email] : [] },
                    messages: email ? [email] : []
                });
            }

            case 'mark-read': {
                const { messageId } = req.body;
                if (!messageId) throw new Error('Message ID missing');
                await gmailService.markAsRead(accessToken, messageId);
                return res.status(200).json({
                    success: true,
                    data: { messages: [] },
                    messages: []
                });
            }

            case 'send': {
                const { to, subject, body } = req.body;
                if (!to || !subject || !body) throw new Error('Missing sending parameters');
                const result = await gmailService.sendEmail(accessToken, { to, subject, body });
                return res.status(200).json({
                    success: true,
                    data: result
                });
            }

            case 'reply': {
                const { threadId, to, subject, body } = req.body;
                if (!threadId || !to || !subject || !body) throw new Error('Missing reply parameters');
                const result = await gmailService.replyEmail(accessToken, { threadId, to, subject, body });
                return res.status(200).json({
                    success: true,
                    data: result
                });
            }

            default:
                return res.status(400).json({
                    success: false,
                    error: `Action '${action}' is not supported`
                });
        }
    } catch (error: any) {
        console.error("🛑 [GMAIL HANDLER ERROR]:", error);
        return res.status(error.status || 500).json({
            success: false,
            error: error.message || "An unexpected Gmail error occurred",
            details: error.details || null
        });
    }
});
