import { getAuth } from './firebase';
import crypto from 'crypto';

export type AuthenticatedRequest = any;

/**
 * Super-Resilient Middleware (Async Aware)
 */
export const withMiddleware = (
    handler: (req: any, res: any) => Promise<any>
) => {
    return async (req: any, res: any) => {
        const requestId = crypto.randomUUID();
        const start = Date.now();

        try {
            const authHeader = req.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
                return res.status(200).json({ success: false, error: { code: 'AUTH_REQUIRED' } });
            }

            const idToken = authHeader.split('Bearer ')[1];
            const auth = await getAuth(); // Async load Firebase

            const decodedToken = await Promise.race([
                auth.verifyIdToken(idToken),
                new Promise((_, reject) => setTimeout(() => reject(new Error("AUTH_TIMEOUT")), 9000))
            ]) as any;

            const authReq = req as any;
            authReq.uid = decodedToken.uid;
            authReq.requestId = requestId;

            return await handler(authReq, res);
        } catch (error: any) {
            console.error("🛑 [AUTH ERROR]:", error.message);
            return res.status(200).json({
                success: false,
                error: { code: 'AUTH_FAILED', message: error.message, latency: Date.now() - start }
            });
        }
    };
};
