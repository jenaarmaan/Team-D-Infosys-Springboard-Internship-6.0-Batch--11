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

    const result = await apiClient.post<{ response: string }>("/api/v1/ai/gemini", { prompt });

    if (!result.success) {
        throw new Error(result.error?.message || "Gemini API call failed");
    }

    return result.data.response;
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
