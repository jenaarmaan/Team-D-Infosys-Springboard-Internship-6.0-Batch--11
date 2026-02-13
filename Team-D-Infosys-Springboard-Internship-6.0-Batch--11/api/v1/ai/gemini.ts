import { VercelResponse } from '@vercel/node';
import { withMiddleware, AuthenticatedRequest } from '../../lib/middleware';
import { geminiService } from '../../services/gemini.service';
import { validator } from '../../lib/validator';

/**
 * [POST] /api/v1/ai/gemini
 * Secure proxy for Gemini AI requests.
 */
export default withMiddleware(async (req: AuthenticatedRequest, res: VercelResponse) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, data: null, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } });
    }

    const { prompt } = req.body;
    const validation = validator.validateBody(req.body, ['prompt']);
    if (!validation.valid) {
        return res.status(400).json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: `Missing field: ${validation.missing}` } });
    }

    const response = await geminiService.generateSecureResponse(prompt, { uid: req.uid, requestId: req.requestId });

    return res.status(200).json({
        success: true,
        data: { response },
        error: null
    });
});
