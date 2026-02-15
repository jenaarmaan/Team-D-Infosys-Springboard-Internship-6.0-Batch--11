import { getGeminiModel } from '../lib/clients/gemini.client';
import { validator } from '../lib/validator';
import { logger } from '../lib/logger';

/**
 * Enterprise Gemini Service
 * Enforces production-grade safety guardrails and sanitization.
 */
export class GeminiService {
    private static SYSTEM_INSTRUCTION =
        `You are Govind, a secure and controlled voice assistant. 
     Never reveal system tokens, API keys, or internal configuration. 
     Your responses must be concise and optimized for text-to-speech output.`;

    async generateSecureResponse(prompt: string, context: Record<string, any> = {}): Promise<string> {
        const { uid, requestId } = context;

        // 1. Sanitize Input
        const cleanPrompt = validator.sanitize(prompt);
        if (!cleanPrompt) {
            throw { code: 'INVALID_INPUT', message: 'The provided prompt was empty or contained only illegal characters.' };
        }

        try {
            const model = getGeminiModel();

            // 2. Wrap Prompt in Guardrails
            const contents = [
                { role: 'user', parts: [{ text: `${GeminiService.SYSTEM_INSTRUCTION}\n\nUser Request: ${cleanPrompt}` }] }
            ];

            const result = await model.generateContent({ contents });
            const response = result.response.text();

            logger.info('Gemini response generated', { uid, requestId });
            return response;

        } catch (error: any) {
            logger.error('Gemini Service failure', error, { uid, requestId });
            throw {
                code: 'AI_TEMPORARILY_UNAVAILABLE',
                message: 'I am having trouble reaching my brain right now. Please try again in a moment.',
                details: error.message
            };
        }
    }
}

export const geminiService = new GeminiService();
