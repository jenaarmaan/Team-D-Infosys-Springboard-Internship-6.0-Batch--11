import { apiClient } from "@/api/client";
import { getValidAccessToken } from "./gmailClient";

/**
 * Fetch latest inbox emails via secure proxy
 */
export async function fetchInbox(limit = 5) {
  console.log("[GMAIL] Fetching inbox via proxy (limit: " + limit + ")");
  const token = await getValidAccessToken();

  const result = await apiClient.get<any>(`/api/v1/gmail?action=list&limit=${limit}`, { googleToken: token });

  console.log("[GMAIL] RAW RESPONSE:", result);

  const messages = (result as any)?.data?.messages ?? (result as any)?.messages ?? [];
  if (!Array.isArray(messages)) {
    console.warn("[GMAIL] Unexpected response shape:", result);
  }

  const safeMessages = Array.isArray(messages) ? messages : [];
  console.log("[GMAIL] messages array length:", safeMessages.length);

  return safeMessages.map((email: any) => ({
    ...email,
    date: new Date(email.date)
  }));
}

/**
 * Fetch ONLY unread inbox emails via secure proxy
 */
export async function fetchUnreadInbox(limit = 10) {
  const token = await getValidAccessToken();
  const result = await apiClient.get<any>(`/api/v1/gmail?action=list&unread=true&limit=${limit}`, { googleToken: token });

  console.log("[GMAIL][UNREAD] RAW RESPONSE:", result);

  const messages = (result as any)?.data?.messages ?? (result as any)?.messages ?? [];
  const safeMessages = Array.isArray(messages) ? messages : [];
  console.log("[GMAIL][UNREAD] messages array length:", safeMessages.length);

  return safeMessages.map((email: any) => ({
    ...email,
    date: new Date(email.date)
  }));
}

/**
 * Read full email content via secure proxy
 */
export async function readEmail(messageId: string) {
  const token = await getValidAccessToken();
  const result = await apiClient.get<any>(`/api/v1/gmail?action=get&id=${messageId}`, { googleToken: token });

  console.log("[GMAIL][GET] RAW RESPONSE:", result);

  const messages = (result as any)?.data?.messages ?? (result as any)?.messages ?? [];
  const safeMessages = Array.isArray(messages) ? messages : [];

  const emailData = safeMessages.length > 0 ? safeMessages[0] : ((result as any)?.data?.email ?? (result as any)?.data);

  if (!emailData || typeof emailData !== 'object') {
    throw new Error("Failed to parse email content");
  }

  return {
    ...emailData,
    date: new Date(emailData.date)
  };
}

/**
 * Mark email as read via secure proxy
 */
export async function markEmailAsRead(messageId: string) {
  const token = await getValidAccessToken();
  const result = await apiClient.post<any>(`/api/v1/gmail?action=mark-read`, { messageId }, { googleToken: token });
  return result.success;
}
