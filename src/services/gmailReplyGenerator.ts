// src/services/gmailReplyGenerator.ts

import { callGeminiSecurely } from "@/lib/ai/gemini";

/**
 * Generate AI-based reply drafts for an email
 */

export type ReplyTone = "polite" | "short" | "professional";

interface ReplyInput {
  emailBody: string;
  sender: string;
  tone: ReplyTone;
}

function buildReplyPrompt(
  emailBody: string,
  sender: string,
  tone: ReplyTone
): string {
  return `
You are an email assistant.
Write a ${tone} reply to the following email.
Keep the reply natural and helpful.
If the email contains masked sensitive data (like <OTP_MASKED>), do NOT try to guess it. Keep the reply generic if it refers to those details.

Sender: ${sender}

Email content:
${emailBody}

Reply:
`;
}

export async function generateReplyDraft({
  emailBody,
  sender,
  tone,
}: ReplyInput) {
  // Default fallback reply
  let reply = `Hello ${sender},\n\nThank you for your message. I will review this and respond soon.\n\nKind regards`;

  try {
    const prompt = buildReplyPrompt(emailBody, sender, tone);
    const { response, privacy } = await callGeminiSecurely(prompt);

    if (response && response.length > 10) {
      reply = response.trim();
    }

    if (privacy.entities.length > 0) {
      console.log(`[PRIVACY] Reply generated with ${privacy.entities.length} masked entities in context.`);
    }

    return {
      tone,
      draft: reply,
      editable: true,
      requiresConfirmation: true,
      privacyInfo: privacy.entities.map(e => e.type)
    };
  } catch (err) {
    console.error("Reply generation failed:", err);
    return {
      tone,
      draft: reply,
      editable: true,
      requiresConfirmation: true
    };
  }
}
