import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Cold-Start Optimized Gemini Client Singleton
 */
let genAI: GoogleGenerativeAI | null = null;

export function getGeminiClient() {
    if (genAI) return genAI;

    const apiKey = process.env.GEMINI_API_KEY || process.env.apiKey;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY (or apiKey) is missing from environment');
    }

    genAI = new GoogleGenerativeAI(apiKey);
    return genAI;
}

export function getGeminiModel(modelName: string = 'gemini-2.0-flash') {
    return getGeminiClient().getGenerativeModel({ model: modelName });
}
