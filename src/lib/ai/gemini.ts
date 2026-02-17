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
        const result = await apiClient.post<{ response: string }>("/api/v1/ai/gemini", { prompt });
        if (result.success) return result.data.response;
        console.warn("[AI] Backend call failed, falling back to frontend direct call.");
    } catch (err) {
        console.error("[AI] Backend call crashed, falling back to frontend direct call.", err);
    }

    // Fallback: Direct Frontend Call
    try {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_FIREBASE_API_KEY || (window as any).apiKey;

        if (!apiKey) {
            throw new Error("Gemini API key not found for fallback.");
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const systemInstruction = "You are Govind, a secure and controlled voice assistant. Your responses must be concise and optimized for text-to-speech output.";
        const fullPrompt = `${systemInstruction}\n\nUser Request: ${prompt}`;

        const result = await model.generateContent(fullPrompt);
        const response = result.response.text();
        return response;
    } catch (fallbackErr) {
        console.error("[AI] Fallback Gemini call failed:", fallbackErr);
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
