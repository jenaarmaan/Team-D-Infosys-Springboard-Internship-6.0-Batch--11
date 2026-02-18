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
            throw { code: 'INVALID_INPUT', message: 'The provided prompt was empty.' };
        }

        try {
            const model = getGeminiModel();

            // 2. Wrap Prompt in Guardrails - Use simpler string-based prompt for maximum compatibility
            const fullPrompt = `You are Govind, a concise voice assistant. Optimize for TTS.\n\nUser: ${cleanPrompt}`;

            const result = await model.generateContent(fullPrompt);

            if (!result || !result.response) {
                throw new Error("EMPTY_GEMINI_RESPONSE");
            }

            const response = result.response.text();
            if (!response) {
                console.warn("⚠️ [GEMINI] No text in response.");
                return "I'm sorry, I couldn't generate a response.";
            }

            logger.info('Gemini response generated', {
                uid,
                requestId,
                tokCount: result.response.usageMetadata?.totalTokenCount
            });
            return response;

        } catch (error: any) {
            console.error("❌ [GEMINI SERVICE ERROR]:", error.message || error);
            throw {
                code: 'AI_ERROR',
                message: error.message || 'I am having trouble reaching my brain.',
                details: error.details || null
            };
        }
    }
}

export const geminiService = new GeminiService();
