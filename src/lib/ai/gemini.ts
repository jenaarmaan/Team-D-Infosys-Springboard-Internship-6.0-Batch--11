// src/lib/ai/gemini.ts

import { detectSensitiveData } from "@/privacy/detector";
import { sanitize } from "@/privacy/sanitizer";
import { SanitizedResult } from "@/privacy/entities";

import { apiClient } from "@/api/client";

/**
 * Low-level function to call Gemini.
 * Enforces a hard boundary: Throws if raw sensitive data is detected.
 */
export async function callGemini(prompt: string): Promise<string> {
    // Hard Boundary Check: Ensure no raw sensitive data is being sent
    const sensitiveEntities = detectSensitiveData(prompt);
    if (sensitiveEntities.length > 0) {
        console.error("[PRIVACY] HARD BOUNDARY VIOLATED: Raw sensitive data detected in prompt.", sensitiveEntities);
        throw new Error("Security Violation: Raw sensitive data cannot be sent to Gemini. Please use callGeminiSecurely.");
    }

    try {
        console.log("[AI] Attempting backend Gemini call...");
        const result = await apiClient.post<{ response: string }>("/api/v1/ai", { prompt });
        if (result.success) return result.data.response;
        console.warn("[AI] Backend call failed, falling back to frontend direct call.");
    } catch (err) {
        console.error("[AI] Backend call crashed, falling back to frontend direct call.", err);
    }

    // Fallback: Direct Frontend Call
    try {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const env = import.meta.env;
        const apiKey = env.VITE_GEMINI_API_KEY;

        if (!apiKey) {
            console.error("[AI] No frontend Gemini key found. Please set VITE_GEMINI_API_KEY.");
            throw new Error("AI_KEY_MISSING_IN_PRODUCTION");
        }

        console.log(`[AI] Using frontend fallback key starting with: ${apiKey.substring(0, 8)}...`);

        const genAI = new GoogleGenerativeAI(apiKey);
        const modelMatrix = [
            { id: "gemini-1.5-flash", version: "v1" },
            { id: "gemini-1.5-flash", version: "v1beta" },
            { id: "gemini-1.5-pro", version: "v1" },
            { id: "gemini-pro", version: "v1" },
            { id: "gemini-1.0-pro", version: "v1" }
        ];

        let lastError: any;

        for (const config of modelMatrix) {
            try {
                console.log(`[AI] Frontend attempting model: ${config.id} (${config.version})`);
                const model = genAI.getGenerativeModel({
                    model: config.id,
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HARASSMENT' as any, threshold: 'BLOCK_NONE' as any },
                        { category: 'HARM_CATEGORY_HATE_SPEECH' as any, threshold: 'BLOCK_NONE' as any },
                        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as any, threshold: 'BLOCK_NONE' as any },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as any, threshold: 'BLOCK_NONE' as any },
                    ]
                }, { apiVersion: config.version }); // 🚀 Try different versions explicitly

                const systemInstruction = "You are Govind, a secure and controlled voice assistant. Your responses must be concise and optimized for text-to-speech output.";
                const fullPrompt = `${systemInstruction}\n\nUser Request: ${prompt}`;

                const result = await model.generateContent(fullPrompt);
                const response = result.response.text();
                if (response) return response;
            } catch (err: any) {
                console.warn(`[AI] Frontend attempt failed for ${config.id} (${config.version}):`, err.message);
                lastError = err;
            }
        }

        throw lastError;
    } catch (fallbackErr: any) {
        console.error("[AI] All Frontend Fallback attempts failed:", fallbackErr);

        if (fallbackErr.message?.includes("API_KEY_SERVICE_BLOCKED") || fallbackErr.message?.includes("403")) {
            throw new Error("AI Service Blocked: The browser-side API key is restricted. Please enable 'Generative Language API' in Google Cloud Console.");
        }

        throw fallbackErr;
    }
}

/**
 * Recommended way to call Gemini.
 * Automatically handles detection and sanitization.
 */
export async function callGeminiSecurely(rawPrompt: string): Promise<{ response: string; privacy: SanitizedResult }> {
    const spans = detectSensitiveData(rawPrompt);
    const sanitized = sanitize(rawPrompt, spans);

    console.log("[PRIVACY] Calling Gemini with sanitized prompt.");
    const response = await callGemini(sanitized.sanitizedText);

    return {
        response,
        privacy: sanitized
    };
}
