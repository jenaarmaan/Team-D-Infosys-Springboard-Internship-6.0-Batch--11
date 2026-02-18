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
        const requestId = crypto.randomUUID();
        const start = Date.now();

        console.log(`[MIDDLEWARE] Handling request: ${req.url} (${requestId})`);

        try {
            const authHeader = req.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
                console.warn("[MIDDLEWARE] Missing or invalid authorization header");
                return res.status(200).json({
                    success: false,
                    error: { code: 'AUTH_REQUIRED', message: 'Missing Authorization header' }
                });
            }

            const idToken = authHeader.split('Bearer ')[1];

            // Lazy load Admin to prevent boot crashes if possible
            const auth = await getAuth();

            if (!auth) {
                throw new Error("FIREBASE_AUTH_NOT_AVAILABLE");
            }

            console.log("[MIDDLEWARE] Verifying token...");
            const decodedToken = await Promise.race([
                auth.verifyIdToken(idToken),
                new Promise((_, reject) => setTimeout(() => reject(new Error("AUTH_TIMEOUT")), 9000))
            ]) as any;

            const authReq = req as AuthenticatedRequest;
            authReq.uid = decodedToken.uid;
            authReq.requestId = requestId;

            console.log(`✅ [AUTH] Verified UID: ${decodedToken.uid} (${Date.now() - start}ms)`);
            return await handler(authReq, res);

        } catch (error: any) {
            console.error("🛑 [AUTH ERROR]:", error);
            const message = error?.message || String(error);

            return res.status(200).json({
                success: false,
                data: null,
                error: {
                    code: message === "AUTH_TIMEOUT" ? "AUTH_TIMEOUT" : "AUTH_FAILED",
                    message: message,
                    latency: Date.now() - start
                }
            });
        }
    };
};
