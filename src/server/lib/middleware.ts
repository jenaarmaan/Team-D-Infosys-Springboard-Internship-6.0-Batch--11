import { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuth } from './clients/firebase.admin';
import { logger } from './logger';
import crypto from 'crypto';

export type AuthenticatedRequest = VercelRequest & {
    uid: string;
    requestId: string;
    userRole?: string;
};

/**
 * Standardized API Handler Wrapper
 * Handles: Auth, Request Tracing, Unified Error Formatting, and Performance Logging.
 */
export const withMiddleware = (
    handler: (req: AuthenticatedRequest, res: VercelResponse) => Promise<any>,
    options: { requiredRole?: string } = {}
) => {
    return async (req: VercelRequest, res: VercelResponse) => {
        const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
        const startTime = Date.now();

        // 🩺 DEBUG: ENV CHECK (Masked)
        console.log("🛠️ [ENV DIAGNOSTIC]", {
            FIREBASE_SA: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
            G_CLIENT: !!(process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID),
            G_SECRET: !!(process.env.GOOGLE_CLIENT_SECRET || process.env.VITE_GOOGLE_CLIENT_SECRET),
            TG_BOT: !!process.env.TELEGRAM_BOT_TOKEN
        });

        try {
            console.log(`🔌 [MIDDLEWARE] New Request: ${req.method} ${req.url}`);

            // 1. Authenticate via Firebase ID Token
            const authHeader = req.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
                return res.status(401).json({
                    success: false,
                    data: null,
                    error: { code: 'AUTH_REQUIRED', message: 'Authorization Bearer token required' }
                });
            }

            const idToken = authHeader.split('Bearer ')[1];
            if (!idToken) {
                return res.status(401).json({ success: false, data: null, error: { code: 'INVALID_TOKEN', message: 'Token missing' } });
            }

            const firebaseAuth = getAuth();
            const decodedToken = await firebaseAuth.verifyIdToken(idToken);
            const uid = decodedToken.uid;

            // 2. Prepare Authenticated Request Context
            const authReq = req as AuthenticatedRequest;
            authReq.uid = uid;
            authReq.requestId = requestId;

            // RBAC Placeholder
            authReq.userRole = (decodedToken.role as string) || 'user';

            if (options.requiredRole && authReq.userRole !== options.requiredRole) {
                console.warn(`🚫 [AUTH] Access denied for ${uid}: Required role ${options.requiredRole}`);
                return res.status(403).json({
                    success: false,
                    data: null,
                    error: { code: 'FORBIDDEN', message: 'Insufficient privileges' }
                });
            }

            // 3. Execute Core Handler
            console.log(`🚀 [API] Executing ${req.url}`, { uid, requestId });
            await handler(authReq, res);

            const duration = Date.now() - startTime;
            logger.info('API request completed', { endpoint: req.url, uid, requestId, duration });

        } catch (error: any) {
            const duration = Date.now() - startTime;
            console.error("🛑 [MIDDLEWARE ERROR]", {
                message: error.message,
                stack: error.stack,
                requestId,
                endpoint: req.url
            });
            logger.error('API request failed', error, { endpoint: req.url, requestId, duration });

            // Unified Error Response
            const statusCode = error.status || 500;
            if (!res.writableEnded) {
                return res.status(statusCode).json({
                    success: false,
                    data: {
                        status: "error", // Changed from "ok" as this is an error response
                        timestamp: new Date().toISOString(),
                        env: {
                            hasFirebaseSA: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
                            hasGemini: !!(process.env.GEMINI_API_KEY || process.env.apiKey),
                            hasTelegram: !!process.env.TELEGRAM_BOT_TOKEN
                        }
                    },
                    error: {
                        code: error.code || 'INTERNAL_SERVER_ERROR',
                        message: error.message || 'An unexpected error occurred.',
                        details: error.details
                    }
                });
            }
        }
    };
};
