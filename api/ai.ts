import { VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../src/server/lib/middleware';
import { validator } from '../src/server/lib/validator';

/**
 * [POST] /api/v1/ai/gemini
 * Secure proxy for Gemini AI requests.
 */
const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
    const start = Date.now();
    console.log(`🚀 [AI HANDLER START] ReqID: ${req.requestId}`);

    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Use POST' });
        }

        // Defensive body parsing
        let body = req.body;
        if (typeof body === 'string' && body.length > 0) {
            try {
                body = JSON.parse(body);
            } catch (e) {
                console.warn("⚠️ [AI] Failed to parse string body.");
            }
        }

        const { prompt } = body || {};
        if (!prompt) {
            return res.status(400).json({ success: false, error: 'Prompt is required' });
        }

        console.log(`🤖 [AI API] Prompt: "${prompt.substring(0, 40)}..."`);
        // console.log(`👤 UID: ${req.uid} | ReqID: ${req.requestId}`); // This line was removed as per instruction

        // Lazy load Gemini Service
        const { geminiService } = await import('../src/server/services/gemini.service');

        const result = await geminiService.generateSecureResponse(prompt, {
            uid: req.uid,
            requestId: req.requestId
        });

        const duration = Date.now() - start;
        console.log(`✅ [AI HANDLER SUCCESS] Duration: ${duration}ms`);

        return res.status(200).json({
            success: true,
            data: { response: result },
            error: null
        });
    } catch (error: any) {
        const duration = Date.now() - start;
        console.error(`🛑 [AI HANDLER ERROR] After ${duration}ms:`, error);

        // Ensure we always return JSON, even on crash
        return res.status(500).json({
            success: false,
            error: error.message || "Internal AI Error",
            code: error.code || 'AI_CRASH',
            details: error.details || null
        });
    }
};

export default withMiddleware(handler);
