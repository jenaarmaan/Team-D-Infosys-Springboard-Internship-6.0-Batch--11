import { apiClient } from "@/api/client";
import { getValidAccessToken, getGmailClient } from "./gmailClient";

/**
 * Send new email via secure proxy with fallback
 */
export async function sendEmail(to: string, subject: string, body: string) {
  console.log("[GMAIL] Sending email...");
  const token = await getValidAccessToken();

  try {
    const result = await apiClient.post<any>("/api/v1/gmail?action=send", { to, subject, body }, { googleToken: token });
    if (result.success) return result.data;
  } catch (err) {
    console.error("[GMAIL] Backend send failed, falling back.", err);
  }

  // Fallback: Direct Fetch
  try {
    const rawMessage = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      body
    ].join('\r\n');

    const encodedMessage = btoa(unescape(encodeURIComponent(rawMessage)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await fetch('https://gmail.googleapis.com/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: encodedMessage })
    });

    if (!response.ok) throw new Error(`Fallback send failed: ${response.status}`);
    return await response.json();
  } catch (fallbackErr) {
    console.error("[GMAIL] Fallback send failed:", fallbackErr);
    throw fallbackErr;
  }
}

/**
 * Reply to an existing email via secure proxy with fallback
 */
export async function replyToEmail(threadId: string, to: string, subject: string, body: string) {
  console.log("[GMAIL] Replying to email...");
  const token = await getValidAccessToken();

  try {
    const result = await apiClient.post<any>("/api/v1/gmail?action=reply", { threadId, to, subject, body }, { googleToken: token });
    if (result.success) return result.data;
  } catch (err) {
    console.error("[GMAIL] Backend reply failed, falling back.", err);
  }

  // Fallback: Direct Fetch
  try {
    const rawMessage = [
      `To: ${to}`,
      `Subject: Re: ${subject}`,
      `In-Reply-To: ${threadId}`,
      `References: ${threadId}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      body
    ].join('\r\n');

    const encodedMessage = btoa(unescape(encodeURIComponent(rawMessage)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await fetch('https://gmail.googleapis.com/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: encodedMessage, threadId })
    });

    if (!response.ok) throw new Error(`Fallback reply failed: ${response.status}`);
    return await response.json();
  } catch (fallbackErr) {
    console.error("[GMAIL] Fallback reply failed:", fallbackErr);
    throw fallbackErr;
  }
}
