// src/services/gmailSummarizer.ts

import { callGeminiSecurely } from "@/lib/ai/gemini";

/**
 * Max characters allowed for summarization
 */
const MAX_EMAIL_LENGTH = 4000;

/**
 * Truncate long email safely
 */
function truncateEmail(content: string): string {
  if (content.length <= MAX_EMAIL_LENGTH) return content;
  return content.slice(0, MAX_EMAIL_LENGTH) + "...";
}

/**
 * Summarize email content using Gemini securely
 */
export async function summarizeEmail(emailBody: string) {
  const safeContent = truncateEmail(emailBody);

  const prompt = `
Summarize the following email content. 
Provide a concise 1-2 sentence summary and a few bullet points of the key details.
If there are sensitive details like OTPs or PII, they will be masked—please describe the intent of the message without needing the specific masked values.

EMAIL CONTENT:
${safeContent}

OUTPUT FORMAT:
Summary: [Summary here]
Bullets:
- [Item 1]
- [Item 2]
`;

  try {
    const { response, privacy } = await callGeminiSecurely(prompt);

    // Parse the response
    const summaryMatch = response.match(/Summary:\s*(.+)/i);
    const summary = summaryMatch ? summaryMatch[1].trim() : "Failed to generate summary.";

    const bulletLines = response.split("\n")
      .filter(line => line.trim().startsWith("-") || line.trim().startsWith("*"))
      .map(line => line.trim().replace(/^[-*]\s*/, ""));

    if (privacy.entities.length > 0) {
      console.log(`[PRIVACY] Email summarized with ${privacy.entities.length} masked entities.`);
    }

    return {
      summary,
      bullets: bulletLines.length > 0 ? bulletLines : ["No specific details extracted."],
      privacyInfo: privacy.entities.map(e => e.type) // For UI/UX messages
    };
  } catch (error) {
    console.error("Summarization failed:", error);
    return {
      summary: "I couldn't summarize this email due to an error.",
      bullets: []
    };
  }
}

/**
 * Clean up raw email content and format it into a human-friendly narrative
 */
export async function humanizeEmail(emailBody: string, subject: string, from: string, images?: string[]) {
  const safeContent = truncateEmail(emailBody);

  const prompt = `
You are an expert email reader and conversational assistant named Govind.
I will give you the raw content of an email. It often contains ugly URLs, tracking pixels, [image: x] placeholders, and technical noise.

YOUR GOAL:
1. Transform this into a clean, human-friendly narrative that is easy to read and sounds natural when spoken.
2. REMOVE: All long URLs (e.g. https://accounts.google.com/AccountChooser?Email=...), tracking tags, and useless technical metadata.
3. INFER: If you see something like "[image: Google]", mention it naturally (e.g. "This is a security alert from Google, featuring their logo at the top").
4. FLOW: Use a smooth conversational flow. Instead of "Subject: x, From: y, Content: z", say "You've received a security alert from Google regarding your account...".
5. FORMATTING: Use clear paragraphs. Keep it professional but accessible.
6. PERSPECTIVE: Speak as an assistant who is reading the mail TO the user. Use phrases like "This email is from..." or "It informs you that...".

EMAIL DETAILS:
From: ${from}
Subject: ${subject}
RAW CONTENT:
${safeContent}

HUMANIZED NARRATIVE:
`;

  try {
    const { response, privacy } = await callGeminiSecurely(prompt, images);
    return {
      content: response.trim(),
      privacyInfo: privacy.entities.map(e => e.type)
    };
  } catch (error) {
    console.error("Humanization failed:", error);
    return {
      content: emailBody, // Fallback to raw if logic fails
      privacyInfo: []
    };
  }
}

