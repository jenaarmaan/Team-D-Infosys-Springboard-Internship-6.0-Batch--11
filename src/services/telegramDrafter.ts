// src/services/telegramDrafter.ts
import { callGeminiSecurely } from "@/lib/ai/gemini";

export interface TelegramDraft {
    body: string;
    privacyInfo?: string[];
}

/**
 * AI-Powered Telegram Reply Generator
 * Takes recent context and generates a natural, short reply.
 */
export async function generateTelegramDraft(history: any[], chatTitle: string): Promise<TelegramDraft> {
    if (!history || history.length === 0) {
        return { body: "Hey! How can I help you today?" };
    }

    const contextText = history
        .slice(0, 5) // Recent 5 messages
        .reverse()
        .map(m => `${m.senderName}: ${m.text}`)
        .join("\n");

    const prompt = `
    You are an AI assistant helping a user reply to their Telegram messages.
    The conversation is with "${chatTitle}".
    Recent context:
    ${contextText}
    
    Task:
    Generate a short, helpful, and natural-sounding reply (1 sentence max).
    The reply should be appropriate for the tone of the conversation.
    If the last message was a question, try to answer it suggestively if possible, otherwise just a polite acknowledgment.
    
    IMPORTANT: Respond ONLY with the text of the reply. Do not include quotes or any other text.
    `;

    try {
        const { response: body, privacy } = await callGeminiSecurely(prompt);
        const privacyInfo = privacy.entities.map(e => e.type);

        return {
            body: body.replace(/^"+|"+$/g, '').trim(),
            privacyInfo
        };
    } catch (e) {
        console.error("Failed to generate AI telegram draft:", e);
        return { body: "I've received your messages and will get back to you soon." };
    }
}
