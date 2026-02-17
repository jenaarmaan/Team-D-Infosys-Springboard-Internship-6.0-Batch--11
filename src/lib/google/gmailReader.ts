import { apiClient } from "@/api/client";
import { getValidAccessToken, getGmailClient } from "./gmailClient";

/**
 * Fetch latest inbox emails via secure proxy with fallback
 */
export async function fetchInbox(limit = 5) {
  console.log("[GMAIL] Fetching inbox (limit: " + limit + ")");
  const token = await getValidAccessToken();

  try {
    console.log("[GMAIL] Attempting backend fetch...");
    const result = await apiClient.get<any>(`/api/v1/gmail?action=list&limit=${limit}`, { googleToken: token });

    if (result.success) {
      const messages = (result as any).data?.messages ?? (result as any).messages ?? [];
      return (Array.isArray(messages) ? messages : []).map((email: any) => ({
        ...email,
        date: new Date(email.date)
      }));
    }
    console.warn("[GMAIL] Backend fetch failed, falling back to frontend direct fetch.");
  } catch (err) {
    console.error("[GMAIL] Backend fetch crashed, falling back to frontend direct fetch.", err);
  }

  // Fallback: Direct GAPI Fetch
  try {
    const gmail = await getGmailClient();
    const response = await gmail.messages.list({
      maxResults: limit,
      q: 'label:INBOX'
    });

    const messages = response.result.messages || [];
    const emails = await Promise.all(
      messages.slice(0, 2).map(async (msg: any) => {
        const detail = await gmail.messages.get({ id: msg.id, format: 'metadata' });
        const headers = detail.result.payload.headers || [];
        const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || '';

        return {
          id: msg.id,
          threadId: detail.result.threadId,
          from: getHeader('From'),
          subject: getHeader('Subject'),
          date: new Date(getHeader('Date')),
          snippet: detail.result.snippet,
          isUnread: detail.result.labelIds?.includes('UNREAD')
        };
      })
    );
    return emails.filter(Boolean);
  } catch (fallbackErr) {
    console.error("[GMAIL] Fallback fetch failed:", fallbackErr);
    throw fallbackErr;
  }
}

/**
 * Fetch ONLY unread inbox emails via secure proxy with fallback
 */
export async function fetchUnreadInbox(limit = 10) {
  const token = await getValidAccessToken();

  try {
    const result = await apiClient.get<any>(`/api/v1/gmail?action=list&unread=true&limit=${limit}`, { googleToken: token });
    if (result.success) {
      const messages = (result as any).data?.messages ?? (result as any).messages ?? [];
      return (Array.isArray(messages) ? messages : []).map((email: any) => ({
        ...email,
        date: new Date(email.date)
      }));
    }
  } catch (err) {
    console.error("[GMAIL][UNREAD] Backend fetch failed, falling back.", err);
  }

  // Fallback: Direct GAPI Fetch
  try {
    const gmail = await getGmailClient();
    const response = await gmail.messages.list({
      maxResults: limit,
      q: 'is:unread label:INBOX'
    });

    const messages = response.result.messages || [];
    const emails = await Promise.all(
      messages.slice(0, 2).map(async (msg: any) => {
        const detail = await gmail.messages.get({ id: msg.id, format: 'metadata' });
        const headers = detail.result.payload.headers || [];
        const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || '';

        return {
          id: msg.id,
          threadId: detail.result.threadId,
          from: getHeader('From'),
          subject: getHeader('Subject'),
          date: new Date(getHeader('Date')),
          snippet: detail.result.snippet,
          isUnread: true
        };
      })
    );
    return emails.filter(Boolean);
  } catch (fallbackErr) {
    console.error("[GMAIL][UNREAD] Fallback fetch failed:", fallbackErr);
    throw fallbackErr;
  }
}

/**
 * Read full email content via secure proxy with fallback
 */
export async function readEmail(messageId: string) {
  const token = await getValidAccessToken();

  try {
    const result = await apiClient.get<any>(`/api/v1/gmail?action=get&id=${messageId}`, { googleToken: token });
    if (result.success) {
      const messages = (result as any).data?.messages ?? (result as any).messages ?? [];
      const emailData = Array.isArray(messages) && messages.length > 0 ? messages[0] : (result.data?.email ?? result.data);
      if (emailData && typeof emailData === 'object') {
        return {
          ...emailData,
          date: new Date(emailData.date)
        };
      }
    }
  } catch (err) {
    console.error("[GMAIL][GET] Backend fetch failed, falling back.", err);
  }

  // Fallback: Direct GAPI Fetch
  try {
    const gmail = await getGmailClient();
    const response = await gmail.messages.get({ id: messageId, format: 'full' });
    const data = response.result;
    const payload = data.payload;
    const headers = payload?.headers || [];
    const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || '';

    const extractBody = (p: any): string => {
      if (!p) return '';
      if (p.mimeType === 'text/plain' && p.body?.data) {
        return atob(p.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      }
      if (p.parts) {
        for (const part of p.parts) {
          const body = extractBody(part);
          if (body) return body;
        }
      }
      return '';
    };

    return {
      id: messageId,
      threadId: data.threadId,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      date: new Date(getHeader('Date')),
      body: extractBody(payload)
    };
  } catch (fallbackErr) {
    console.error("[GMAIL][GET] Fallback fetch failed:", fallbackErr);
    throw fallbackErr;
  }
}

/**
 * Mark email as read via secure proxy with fallback
 */
export async function markEmailAsRead(messageId: string) {
  const token = await getValidAccessToken();

  try {
    const result = await apiClient.post<any>(`/api/v1/gmail?action=mark-read`, { messageId }, { googleToken: token });
    if (result.success) return true;
  } catch (err) {
    console.error("[GMAIL][READ] Backend mark-read failed, falling back.", err);
  }

  // Fallback: Direct GAPI Fetch
  try {
    const gmail = await getGmailClient();
    await gmail.messages.batchModify({
      ids: [messageId],
      removeLabelIds: ['UNREAD']
    });
    return true;
  } catch (fallbackErr) {
    console.error("[GMAIL][READ] Fallback mark-read failed:", fallbackErr);
    return false;
  }
}
