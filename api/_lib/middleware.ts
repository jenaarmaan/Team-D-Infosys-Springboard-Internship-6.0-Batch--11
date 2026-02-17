import { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuth } from './firebase';
import crypto from 'crypto';

export type AuthenticatedRequest = VercelRequest & {
    uid: string;
    requestId: string;
};

export const withMiddleware = (
    handler: (req: AuthenticatedRequest, res: VercelResponse) => Promise<any>
) => {
    return async (req: VercelRequest, res: VercelResponse) => {
        const requestId = crypto.randomUUID();
        const start = Date.now();

        try {
            const authHeader = req.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
                return res.status(200).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Missing Token' } });
            }

            const idToken = authHeader.split('Bearer ')[1];
            const auth = getAuth();

            const decodedToken = await Promise.race([
                auth.verifyIdToken(idToken),
                new Promise((_, reject) => setTimeout(() => reject(new Error("AUTH_TIMEOUT")), 9000))
            ]) as any;

            const authReq = req as AuthenticatedRequest;
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
