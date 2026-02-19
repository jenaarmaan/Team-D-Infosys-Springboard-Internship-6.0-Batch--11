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
        console.log("[AI] Attempting backend Gemini call via /api/v1/ai...");
        const result = await apiClient.post<{ response: string }>("/api/v1/ai", { prompt });

        if (result.success) {
            console.log("[AI] Backend call successful.");
            return result.data.response;
        }

        // 🚨 CRITICAL: Log backend diagnostics if available
        if ((result as any).debug) {
            console.error("❌ [AI BACKEND ERROR] Diagnostics:", (result as any).debug);
        }

        throw new Error(result.error?.message || "AI Backend failed");
    } catch (err: any) {
        const isProd = import.meta.env.PROD;

        if (isProd) {
            console.error("[AI] Backend call failed in production. Frontend fallback is DISABLED for security and consistency.", err);
            throw err;
        }

        console.warn("[AI] Backend call failed/local. Falling back to frontend direct call for development.", err);
    }

    // Fallback: Direct Frontend Call (Development Only)
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const env = import.meta.env;
    const apiKey = env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
        console.error("[AI] No local Gemini key found. Please set VITE_GEMINI_API_KEY.");
        throw new Error("AI_KEY_MISSING_LOCALLY");
    }

    const keyPrefix = apiKey.substring(0, 10);
    const keySuffix = apiKey.substring(apiKey.length - 4);
    console.log(`[AI] (v1.0.19) Using local direct key: ${keyPrefix}...${keySuffix}`);

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelMatrix = [
        { id: "gemini-1.5-flash", version: "v1" },
        { id: "gemini-1.5-flash", version: "v1beta" },
        { id: "gemini-1.5-flash-latest", version: "v1beta" },
        { id: "gemini-1.5-flash-8b", version: "v1beta" },
        { id: "gemini-1.5-pro", version: "v1" },
        { id: "gemini-pro", version: "v1" }
    ];

    let lastError: any;

    for (const config of modelMatrix) {
        try {
            console.log(`[AI] Local attempting model: ${config.id} (${config.version})`);
            const model = genAI.getGenerativeModel({
                model: config.id,
                safetySettings: [
                    { category: 'HARM_CATEGORY_HARASSMENT' as any, threshold: 'BLOCK_NONE' as any },
                    { category: 'HARM_CATEGORY_HATE_SPEECH' as any, threshold: 'BLOCK_NONE' as any },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as any, threshold: 'BLOCK_NONE' as any },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as any, threshold: 'BLOCK_NONE' as any },
                ]
            }, { apiVersion: config.version });

            const systemInstruction = "You are Govind, a secure and controlled voice assistant. Your responses must be concise and optimized for text-to-speech output.";
            const fullPrompt = `${systemInstruction}\n\nUser Request: ${prompt}`;

            const result = await model.generateContent(fullPrompt);
            const response = result.response.text();
            if (response) return response;
        } catch (err: any) {
            console.warn(`[AI] Local attempt failed for ${config.id} (${config.version}):`, err.message);
            lastError = err;
        }
    }

    throw lastError;
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
