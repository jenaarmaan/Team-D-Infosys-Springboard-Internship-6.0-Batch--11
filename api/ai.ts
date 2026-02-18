import { VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../src/server/lib/middleware';
import { geminiService } from '../src/server/services/gemini.service';
import { validator } from '../src/server/lib/validator';

/**
 * [POST] /api/v1/ai/gemini
 * Secure proxy for Gemini AI requests.
 */
const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Use POST' });
        }

        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ success: false, error: 'Prompt is required' });
        }

        console.log(`🤖 [AI API] Prompt (len: ${prompt.length}): "${prompt.substring(0, 20)}..."`);
        console.log(`👤 UID: ${req.uid}`);

        const response = await geminiService.generateSecureResponse(prompt, { uid: req.uid, requestId: req.requestId });

        return res.status(200).json({
            success: true,
            data: { response },
            error: null
        });
    } catch (error: any) {
        console.error("🛑 [AI HANDLER ERROR]:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Internal AI Error",
            details: error.details || null
        });
    }
};

export default withMiddleware(handler);
