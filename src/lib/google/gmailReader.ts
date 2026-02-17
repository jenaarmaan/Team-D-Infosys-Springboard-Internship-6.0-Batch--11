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

  // Fallback: Direct Fetch (Avoids flaky GAPI initialization)
  try {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=label:INBOX`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`Direct Gmail Fetch failed: ${response.status}`);
    }

    const data = await response.json();
    const messages = data.messages || [];

    // Map to simple structure
    const emails = await Promise.all(
      messages.map(async (msg: any) => {
        try {
          const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!detailRes.ok) return null;
          const detail = await detailRes.json();
          const headers = detail.payload?.headers || [];
          const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || '';

          return {
            id: msg.id,
            threadId: detail.threadId,
            from: getHeader('From'),
            subject: getHeader('Subject'),
            date: new Date(getHeader('Date')),
            snippet: detail.snippet,
            isUnread: detail.labelIds?.includes('UNREAD')
          };
        } catch (e) { return null; }
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

  // Fallback: Direct Fetch
  try {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=is:unread label:INBOX`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error(`Fallback failed: ${response.status}`);

    const data = await response.json();
    const messages = data.messages || [];
    const emails = await Promise.all(
      messages.map(async (msg: any) => {
        try {
          const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!res.ok) return null;
          const detail = await res.json();
          const headers = detail.payload?.headers || [];
          const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || '';

          return {
            id: msg.id,
            threadId: detail.threadId,
            from: getHeader('From'),
            subject: getHeader('Subject'),
            date: new Date(getHeader('Date')),
            snippet: detail.snippet,
            isUnread: true
          };
        } catch (e) { return null; }
      })
    );
    return emails.filter(Boolean);
  } catch (fallbackErr) {
    console.error("[GMAIL][UNREAD] Fallback failed:", fallbackErr);
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

  // Fallback: Direct Fetch
  try {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`Fallback failed: ${response.status}`);

    const data = await response.json();
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
    console.error("[GMAIL][GET] Fallback failed:", fallbackErr);
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

  // Fallback: Direct Fetch
  try {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
    });
    return response.ok;
  } catch (fallbackErr) {
    console.error("[GMAIL][READ] Fallback failed:", fallbackErr);
    return false;
  }
}
