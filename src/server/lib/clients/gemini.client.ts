/**
 * Cold-Start Optimized Gemini Client Singleton
 */
let genAI: any = null;

export async function getGeminiClient() {
    if (genAI) return genAI;

    const { GoogleGenerativeAI } = await import('@google/generative-ai');

    // Priority: Explicit Gemini Keys -> generic env keys
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.apiKey;

    if (!apiKey) {
        console.error("❌ [GEMINI CLIENT] AI Key missing in environment!");
        throw new Error('GEMINI_API_KEY is missing. Please set this in your Vercel environment variables.');
    }

    console.log(`📡 [GEMINI CLIENT] Using key starting with: ${apiKey.substring(0, 8)}...`);
    genAI = new GoogleGenerativeAI(apiKey);
    return genAI;
}

export async function getGeminiModel(modelName: string = 'gemini-1.5-flash') {
    const client = await getGeminiClient();
    return client.getGenerativeModel({
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
