import { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuth } from './clients/firebase.admin';
import { logger } from './logger';

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
        const requestId = (req.headers['x-request-id'] as string) || `req-${Math.random().toString(36).substring(7)}`;
        const startTime = Date.now();

        try {
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
            const firebaseAuth = getAuth();
            const decodedToken = await firebaseAuth.verifyIdToken(idToken!);
            const uid = decodedToken.uid;

            // 2. Prepare Authenticated Request Context
            const authReq = req as AuthenticatedRequest;
            authReq.uid = uid;
            authReq.requestId = requestId;

            // RBAC Placeholder: In production, fetch role from claims or Firestore
            authReq.userRole = (decodedToken.role as string) || 'user';

            if (options.requiredRole && authReq.userRole !== options.requiredRole) {
                logger.warn('Access denied: insufficient privileges', { uid, requestId, required: options.requiredRole });
                return res.status(403).json({
                    success: false,
                    data: null,
                    error: { code: 'FORBIDDEN', message: 'Insufficient privileges' }
                });
            }

            // 3. Execute Core Handler
            logger.info('API request started', { endpoint: req.url, uid, requestId });
            await handler(authReq, res);

            const duration = Date.now() - startTime;
            logger.info('API request completed', { endpoint: req.url, uid, requestId, duration });

        } catch (error: any) {
            const duration = Date.now() - startTime;
            logger.error('API request failed', error, { endpoint: req.url, requestId, duration });

            // Unified Error Response
            const statusCode = error.status || 500;
            return res.status(statusCode).json({
                success: false,
                data: null,
                error: {
                    code: error.code || 'INTERNAL_SERVER_ERROR',
                    message: process.env.NODE_ENV === 'production'
                        ? 'An unexpected error occurred. Please try again later.'
                        : error.message,
                    details: process.env.NODE_ENV === 'development' ? error.details : undefined
                }
            });
        }
    };
};
