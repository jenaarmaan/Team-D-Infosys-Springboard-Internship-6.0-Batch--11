import { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuth } from './clients/firebase.admin';
import crypto from 'crypto';

export type AuthenticatedRequest = VercelRequest & {
    uid: string;
    requestId: string;
};

/**
 * Optimized Middleware for High Latency
 */
export const withMiddleware = (
    handler: (req: AuthenticatedRequest, res: VercelResponse) => Promise<any>
) => {
    return async (req: VercelRequest, res: VercelResponse) => {
        const requestId = crypto.randomUUID();
        console.log(`🔌 [MIDDLEWARE] Auth start: ${req.url}`);

        try {
            const authHeader = req.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
                return res.status(401).json({ success: false, error: { message: 'Auth Required' } });
            }

            const idToken = authHeader.split('Bearer ')[1];
            const auth = getAuth();

            // Reduced timeout to 4s to catch it before Vercel kills us
            const decodedToken = await Promise.race([
                auth.verifyIdToken(idToken),
                new Promise((_, reject) => setTimeout(() => reject(new Error("AUTH_TIMEOUT")), 4000))
            ]) as any;

            const authReq = req as AuthenticatedRequest;
            authReq.uid = decodedToken.uid;
            authReq.requestId = requestId;

            return await handler(authReq, res);
        } catch (error: any) {
            console.error("🛑 [MIDDLEWARE FAIL]:", error.message);
            return res.status(200).json({ // Return 200 with error to see it in UI
                success: false,
                data: null,
                error: { code: 'AUTH_FAILED', message: error.message }
            });
        }
    };
};
