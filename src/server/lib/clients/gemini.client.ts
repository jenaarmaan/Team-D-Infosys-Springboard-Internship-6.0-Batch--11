import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Cold-Start Optimized Gemini Client Singleton
 */
let genAI: GoogleGenerativeAI | null = null;

export function getGeminiClient() {
    if (genAI) return genAI;

    const apiKey = process.env.GEMINI_API_KEY || process.env.apiKey;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is missing. Please set this in your Vercel environment variables.');
    }

    genAI = new GoogleGenerativeAI(apiKey);
    return genAI;
}

export function getGeminiModel(modelName: string = 'gemini-1.5-flash') {
    return getGeminiClient().getGenerativeModel({ model: modelName });
}
