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
