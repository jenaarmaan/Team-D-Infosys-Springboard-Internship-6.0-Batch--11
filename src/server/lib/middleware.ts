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
                new Promise((_, reject) => setTimeout(() => reject(new Error("AUTH_TIMEOUT")), 8000))
            ]) as any;

            const authReq = req as AuthenticatedRequest;
            authReq.uid = decodedToken.uid;
            authReq.requestId = requestId;

            const latency = Date.now() - start;
            console.log(`✅ [AUTH] Verified UID: ${decodedToken.uid} (${latency}ms)`);

            // Set a global timeout for the entire request to 25s (just before Vercel kills it)
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("REQUEST_TIMEOUT")), 25000)
            );

            return await Promise.race([
                handler(authReq, res),
                timeoutPromise
            ]);

        } catch (error: any) {
            console.error("🛑 [AUTH ERROR]:", error.message || error);
            const message = error?.message || String(error);

            // Always return a JSON response even on timeout or crash
            return res.status(200).json({
                success: false,
                data: null,
                error: {
                    code: message === "AUTH_TIMEOUT" || message === "REQUEST_TIMEOUT" ? message : "AUTH_FAILED",
                    message: message,
                    latency: Date.now() - start
                }
            });
        }
    };
};
