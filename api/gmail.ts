import { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * [ALL] /api/v1/gmail
 * Consolidated Gmail API Handler - HARDENED VERSION
 * Uses dynamic imports to prevent top-level initialization crashes and speed up cold starts.
 */
export default async (req: VercelRequest, res: VercelResponse) => {
    try {
        // 1. Dynamic Import Middleware
        const { withMiddleware } = await import('../src/server/lib/middleware');

        return await withMiddleware(async (req: any, res: VercelResponse) => {
            const { action } = req.query;
            const uid = req.uid;

            console.log(`📨 [GMAIL API] Action: ${action}, UID: ${uid}`);

            try {
                // 2. Dynamic Import Services only when needed
                const { tokenService } = await import('../src/server/services/token.service');
                const { gmailService } = await import('../src/server/services/gmail.service');

                console.log(`🔑 [GMAIL API] Fetching token for UID: ${uid}`);
                const accessToken = await tokenService.getValidToken(uid);
                console.log(`✅ [GMAIL API] Token acquired.`);

                switch (action) {
                    case 'list': {
                        const { limit, unread, query } = req.query;
                        const requestedLimit = limit ? parseInt(limit as string) : 5;
                        const safeLimit = Math.min(requestedLimit, 10);

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
                console.error("GMAIL SERVICE ERROR:", error);
                // Return structured JSON error
                return res.status(error.status || 500).json({
                    success: false,
                    data: { messages: [] },
                    messages: [],
                    error: error.message || "An unexpected error occurred"
                });
            }
        })(req, res);
    } catch (err: any) {
        console.error("🛑 [FATAL GMAIL API CRASH]", err);
        // This is the final fallback - must return JSON to avoid client-side "Unexpected token A" errors
        if (!res.writableEnded) {
            return res.status(500).json({
                success: false,
                data: null,
                error: "Internal Server Error (Hard Crash)",
                details: err.message
            });
        }
    }
};
