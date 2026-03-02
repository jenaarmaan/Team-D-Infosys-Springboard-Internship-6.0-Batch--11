import { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuth } from './clients/firebase.admin';
import crypto from 'crypto';

export type AuthenticatedRequest = VercelRequest & {
    uid: string;
    requestId: string;
};

/**
 * Super-Resilient Middleware
 * Optimized for high-latency jumps (e.g. Mumbai -> USA).
 */
export const withMiddleware = (
    handler: (req: AuthenticatedRequest, res: VercelResponse) => Promise<any>
) => {
    return async (req: VercelRequest, res: VercelResponse) => {
        const start = Date.now();
        let requestId = "anonymous";

        try {
            // 1. Safe Request ID Generation
            try {
                requestId = crypto.randomUUID();
            } catch (e) {
                requestId = Math.random().toString(36).substring(7);
            }

            console.log(`[MIDDLEWARE] Handling request: ${req.url} (${requestId})`);

            const authHeader = req.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
                console.warn(`[MIDDLEWARE][${requestId}] Missing authorization header`);
                return res.status(200).json({
                    success: false,
                    error: { code: 'AUTH_REQUIRED', message: 'Missing Authorization header' }
                });
            }

            const idToken = authHeader.split('Bearer ')[1];

            const auth = await getAuth();

            if (!auth) {
                throw new Error("FIREBASE_AUTH_NOT_AVAILABLE");
            }

            console.log(`[MIDDLEWARE][${requestId}] Verifying token...`);
            const decodedToken = await Promise.race([
                auth.verifyIdToken(idToken),
                new Promise((_, reject) => setTimeout(() => reject(new Error("AUTH_TIMEOUT")), 8000))
            ]) as any;

            const authReq = req as AuthenticatedRequest;
            authReq.uid = decodedToken.uid;
            authReq.requestId = requestId;

            const latency = Date.now() - start;
            console.log(`✅ [AUTH] Verified UID: ${decodedToken.uid} (${latency}ms) [${requestId}]`);

            // Set a global timeout for the entire request (safety)
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("REQUEST_TIMEOUT")), 25000)
            );

            return await Promise.race([
                handler(authReq, res),
                timeoutPromise
            ]);

        } catch (error: any) {
            console.error(`🛑 [AUTH ERROR][${requestId}]:`, error.message || error);
            const message = error?.message || String(error);

            // Always return a JSON response
            return res.status(200).json({
                success: false,
                data: null,
                error: {
                    code: message === "AUTH_TIMEOUT" || message === "REQUEST_TIMEOUT" ? message : "AUTH_FAILED",
                    message: message,
                    requestId,
                    latency: Date.now() - start
                }
            });
        }
    };
};
