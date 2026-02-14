import { apiClient } from "@/api/client";
import { getValidAccessToken } from "./gmailClient";

/**
 * Fetch latest inbox emails via secure proxy
 */
export async function fetchInbox(limit = 50) {
  console.log("[GMAIL] Fetching inbox via proxy (limit: " + limit + ")");
  const token = await getValidAccessToken();

  const result = await apiClient.get<any[]>(`/api/v1/gmail/list?limit=${limit}`, { googleToken: token });

  if (!result.success) {
    throw new Error(result.error?.message || "Failed to fetch Gmail inbox");
  }

  return result.data.map((email: any) => ({
    ...email,
    date: new Date(email.date)
  }));
}

/**
 * Fetch ONLY unread inbox emails via secure proxy
 */
export async function fetchUnreadInbox(limit = 10) {
  const token = await getValidAccessToken();
  const result = await apiClient.get<any[]>(`/api/v1/gmail/list?unread=true&limit=${limit}`, { googleToken: token });

  if (!result.success) {
    return [];
  }

  return result.data.map((email: any) => ({
    ...email,
    date: new Date(email.date)
  }));
}

/**
 * Read full email content via secure proxy
 */
export async function readEmail(messageId: string) {
  const token = await getValidAccessToken();
  const result = await apiClient.get<any>(`/api/v1/gmail/get?id=${messageId}`, { googleToken: token });

  if (!result.success) {
    throw new Error(result.error?.message || "Failed to read email");
  }

  return {
    ...result.data,
    date: new Date(result.data.date)
  };
}

/**
 * Mark email as read via secure proxy
 */
export async function markEmailAsRead(messageId: string) {
  const token = await getValidAccessToken();
  const result = await apiClient.post<any>(`/api/v1/gmail/mark-read`, { messageId }, { googleToken: token });
  return result.success;
}
