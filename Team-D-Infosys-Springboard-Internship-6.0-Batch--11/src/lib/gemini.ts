import { apiClient } from '../api/client';

/**
 * Frontend Gemini Adapter
 * Delegates all AI processing to the secure Vercel backend proxy.
 */
export async function callGemini(prompt: string): Promise<string> {
    try {
        const data = await apiClient.post<{ response: string }>('/ai/gemini', { prompt });
        return data.response;
    } catch (error: any) {
        console.error('[GEMINI ADAPTER ERROR]', error);
        throw error;
    }
}

/**
 * Component-level helper to trigger secure AI generation.
 */
export async function callGeminiSecurely(rawPrompt: string): Promise<{ response: string }> {
    // In the production version, sanitization and guardrails happen server-side
    // for maximum security and consistency.
    const response = await callGemini(rawPrompt);
    return { response };
}
