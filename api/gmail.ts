import { VercelRequest, VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../src/server/lib/middleware';
import { gmailService } from '../src/server/services/gmail.service';
import { tokenService } from '../src/server/services/token.service';
import { logger } from '../src/server/lib/logger';

/**
 * [ALL] /api/v1/gmail
 * Consolidated Gmail API Handler
 * ENFORCED JSON CONTRACT: Always returns JSON with { success, data: { messages }, error }
 */
// Step 0: Emergency Error Boundary
export default async (req: VercelRequest, res: VercelResponse) => {
    try {
        return await withMiddleware(async (req: AuthenticatedRequest, res: VercelResponse) => {
            console.log(`📨 [GMAIL API] Action: ${req.query.action}, UID: ${req.uid}`);

            // Step 1: Enforce JSON response
            res.setHeader("Content-Type", "application/json");

            const { action } = req.query;
            const uid = req.uid;

            try {
                console.log(`🔑 [GMAIL API] Fetching token for UID: ${uid}`);
                const accessToken = await tokenService.getValidToken(uid);
                console.log(`✅ [GMAIL API] Token acquired. Action: ${action}`);

                switch (action) {
                    case 'list': {
                        const { limit, unread, query } = req.query;
                        console.log(`📧 [GMAIL API] Listing emails (Requested: ${limit || 'default'}, Unread: ${unread}, Query: ${query || 'none'})`);

                        // Enforce a hard cap for Vercel Serverless (10s limit)
                        const requestedLimit = limit ? parseInt(limit as string) : 5;
                        const safeLimit = Math.min(requestedLimit, 10);

                        console.log(`📧 [GMAIL API] Listing emails (Safe Limit: ${safeLimit}, Unread: ${unread})`);

                        const emails = await gmailService.listEmails(accessToken, {
                            limit: safeLimit,
                            unread: unread === 'true',
                            q: query as string
                        });

                        console.log(`📧 [GMAIL API] Found ${emails ? emails.length : 0} emails.`);

                        return res.status(200).json({
                            success: true,
                            data: {
                                messages: emails || []
                            },
                            messages: emails || [],
                            error: null
                        });
                    }

                    case 'get': {
                        const { id } = req.query;
                        if (!id) throw new Error('Email ID missing');

                        console.log(`📧 [GMAIL API] Getting email with ID: ${id}`);
                        const email = await gmailService.getEmail(accessToken, id as string);

                        return res.status(200).json({
                            success: true,
                            data: {
                                messages: email ? [email] : []
                            },
                            messages: email ? [email] : [],
                            error: null
                        });
                    }

                    case 'mark-read': {
                        const { messageId } = req.body;
                        if (!messageId) throw new Error('Message ID missing');

                        console.log(`📧 [GMAIL API] Marking message ${messageId} as read.`);
                        await gmailService.markAsRead(accessToken, messageId);

                        return res.status(200).json({
                            success: true,
                            data: { messages: [] },
                            messages: [],
                            error: null
                        });
                    }

                    default:
                        console.warn(`📧 [GMAIL API] Unsupported action: ${action}`);
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

                return res.status(error.status || 500).json({
                    success: false,
                    data: { messages: [] },
                    messages: [],
                    error: error.message || "An unexpected error occurred during Gmail operation"
                });
            }
        })(req, res);
    } catch (err: any) {
        console.error("🛑 [FATAL GMAIL API CRASH]", err);
        return res.status(500).json({
            success: false,
            error: "Internal Server Error (Fatal Initialization Crash)",
            details: err.message
        });
    }
};
