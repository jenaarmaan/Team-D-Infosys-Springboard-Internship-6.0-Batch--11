import { VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../src/server/lib/middleware';
import { gmailService } from '../src/server/services/gmail.service';
import { tokenService } from '../src/server/services/token.service';
import { validator } from '../src/server/lib/validator';
import { logger } from '../src/server/lib/logger';

/**
 * [ALL] /api/v1/gmail
 * Consolidated Gmail API Handler
 * ENFORCED JSON CONTRACT: Always returns JSON with { success, data: { messages }, error }
 */
export default withMiddleware(async (req: AuthenticatedRequest, res: VercelResponse) => {
    console.log(`📨 [GMAIL API] Action: ${req.query.action}, UID: ${req.uid}`);
    // Step 1: Enforce JSON response
    res.setHeader("Content-Type", "application/json");

    const { action } = req.query;
    const uid = req.uid;

    try {
        // 1. Securely retrieve/refresh token from Firestore
        const accessToken = await tokenService.getValidToken(uid);

        switch (action) {
            case 'list': {
                const { limit, unread, query } = req.query;
                const emails = await gmailService.listEmails(accessToken, {
                    limit: limit ? parseInt(limit as string) : 50,
                    unread: unread === 'true',
                    q: query as string
                });

                // Uniform Success Response (Step 1 & 2 hybrid for compatibility)
                return res.status(200).json({
                    success: true,
                    data: {
                        messages: emails || []
                    },
                    messages: emails || [], // Top-level failsafe for Step 1
                    error: null
                });
            }

            case 'get': {
                const { id } = req.query;
                if (!id) throw new Error('Email ID missing');
                const email = await gmailService.getEmail(accessToken, id as string);
                return res.status(200).json({
                    success: true,
                    data: {
                        messages: email ? [email] : []
                    },
                    messages: email ? [email] : [], // Top-level failsafe for Step 1
                    error: null
                });
            }

            case 'mark-read': {
                const { messageId } = req.body;
                if (!messageId) throw new Error('Message ID missing');
                await gmailService.markAsRead(accessToken, messageId);
                return res.status(200).json({
                    success: true,
                    data: { messages: [] },
                    messages: [],
                    error: null
                });
            }

            default:
                return res.status(400).json({
                    success: false,
                    data: { messages: [] },
                    messages: [],
                    error: `Action '${action}' is not supported`
                });
        }
    } catch (error: any) {
        console.error("GMAIL SERVER ERROR:", error);
        logger.error("GMAIL_API_FATAL", error, { uid, action });

        // Enforced Error Contract (Step 1)
        return res.status(error.status || 500).json({
            success: false,
            data: { messages: [] },
            messages: [],
            error: error.message || "An unexpected error occurred during Gmail operation"
        });
    }
});
