import { apiClient } from "@/api/client";
import { getValidAccessToken } from "./gmailClient";

/**
 * Send new email via secure proxy
 */
export async function sendEmail(to: string, subject: string, body: string) {
  console.log("[GMAIL] Sending email via proxy");
  const token = await getValidAccessToken();

  const result = await apiClient.post<any>("/api/v1/gmail?action=send", { to, subject, body }, { googleToken: token });

  if (!result.success) {
    throw new Error(result.error?.message || "Failed to send email");
  }

  return result.data;
}

/**
 * Reply to an existing email via secure proxy
 */
export async function replyToEmail(threadId: string, to: string, subject: string, body: string) {
  console.log("[GMAIL] Replying to email via proxy");
  const token = await getValidAccessToken();

  const result = await apiClient.post<any>("/api/v1/gmail?action=reply", { threadId, to, subject, body }, { googleToken: token });

  if (!result.success) {
    throw new Error(result.error?.message || "Failed to reply to email");
  }

  return result.data;
}
