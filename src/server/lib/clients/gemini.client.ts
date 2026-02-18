import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Cold-Start Optimized Gemini Client Singleton
 */
let genAI: GoogleGenerativeAI | null = null;

export function getGeminiClient() {
    if (genAI) return genAI;

    const apiKey = process.env.GEMINI_API_KEY || process.env.apiKey || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is missing. Please set this in your Vercel environment variables.');
    }

    genAI = new GoogleGenerativeAI(apiKey);
    return genAI;
}

export function getGeminiModel(modelName: string = 'gemini-1.5-flash') {
    return getGeminiClient().getGenerativeModel({
        model: modelName,
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT' as any, threshold: 'BLOCK_NONE' as any },
            { category: 'HARM_CATEGORY_HATE_SPEECH' as any, threshold: 'BLOCK_NONE' as any },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as any, threshold: 'BLOCK_NONE' as any },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as any, threshold: 'BLOCK_NONE' as any },
        ],
        generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
        }
    });
}
