import { TelegramConfig, TelegramMessage, TelegramChat, TelegramSendResult, TelegramUser } from "./telegramTypes";
import { apiClient } from "@/api/client";

/**
 * Telegram Client Wrapper
 * Refactored for secure production environment.
 * Direct polling and Bot Token usage removed.
 * Relies on Firestore real-time listeners for updates.
 */
export class TelegramClient {
  private isConnected: boolean = false;
  private internalMessages: Record<number, TelegramMessage[]> = {};
  private internalChats: Map<number, TelegramChat> = new Map();
  public activeChatId: number | null = null;

  constructor() {
    // Config no longer needed for direct Bot API calls
  }

  /**
   * Initialize connection status
   */
  async connect(): Promise<void> {
    this.isConnected = true;
    console.log("[TELEGRAM] Connected in production mode (using secure proxies)");
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
    console.log("[TELEGRAM] Disconnected");
  }

  /**
   * External method to update internal cache from Firestore listeners
   */
  updateCacheFromFirestore(update: any) {
    const { chatId, senderId, senderName, text, date, chatTitle, chatType, id } = update;

    // 1. Update Internal Chat Cache
    if (!this.internalChats.has(chatId) || text) {
      const existing = this.internalChats.get(chatId);
      this.internalChats.set(chatId, {
        id: chatId,
        title: chatTitle,
        isPrivate: chatType === "private",
        isSupergroup: chatType === "supergroup" || chatType === "channel",
        unreadCount: existing ? (text ? (existing.unreadCount || 0) + 1 : existing.unreadCount) : 1,
        lastMessage: text || existing?.lastMessage || "[Update]"
      });
    }

    // 2. Update Internal Message Cache
    if (text || id) {
      if (!this.internalMessages[chatId]) this.internalMessages[chatId] = [];

      // Only add if not already present (deduplicate)
      if (!this.internalMessages[chatId].some(m => m.id === id)) {
        this.internalMessages[chatId].push({
          id,
          chatId,
          senderId,
          senderName,
          text,
          date: date?.toDate ? date.toDate() : (typeof date === "number" && date < 2000000000 ? new Date(date * 1000) : new Date(date))
        });

        // Sort and limit per-chat cache
        this.internalMessages[chatId] = this.internalMessages[chatId]
          .sort((a, b) => b.date.getTime() - a.date.getTime())
          .slice(0, 100);
      }
    }
  }

  /**
   * Get latest messages from a chat
   */
  async getMessages(chatId: number, limit: number = 20): Promise<TelegramMessage[]> {
    const msgs = this.internalMessages[chatId] || [];
    return msgs.slice(0, limit);
  }

  /**
   * Get list of recent chats/contacts
   */
  async getChats(): Promise<TelegramChat[]> {
    return Array.from(this.internalChats.values())
      .sort((a, b) => {
        const msgsA = this.internalMessages[a.id] || [];
        const msgsB = this.internalMessages[b.id] || [];
        const dateA = msgsA[0]?.date.getTime() || 0;
        const dateB = msgsB[0]?.date.getTime() || 0;
        return dateB - dateA;
      });
  }

  /**
   * Deep Sync: Returns chats and their recent messages in one go.
   * Now actually fetches from the backend to ensure data consistency.
   */
  async getRecentContext(): Promise<{ chats: TelegramChat[], messages: Record<number, TelegramMessage[]> }> {
    try {
      // 1. Fetch historical updates from backend (Syncing)
      const response = await apiClient.post<any>("/api/v1/telegram?action=updates", { limit: 100 });

      if (response.success && response.data && Array.isArray(response.data)) {
        console.log(`[TELEGRAM CLIENT] Syncing ${response.data.length} updates from backend`);
        response.data.forEach((upd: any) => this.updateCacheFromFirestore(upd));
      }
    } catch (err) {
      console.warn("[TELEGRAM CLIENT] Deep sync failed, using local cache only", err);
    }

    // 2. Return snapshots of the current internal state
    const clonedMessages: Record<number, TelegramMessage[]> = {};
    Object.entries(this.internalMessages).forEach(([id, msgs]) => {
      clonedMessages[Number(id)] = [...msgs];
    });

    return {
      chats: Array.from(this.internalChats.values()).map(c => ({ ...c })),
      messages: clonedMessages
    };
  }

  /**
   * Send a message to a chat via secure backend proxy
   */
  async sendMessage(chatId: number, text: string): Promise<TelegramSendResult> {
    if (!this.isConnected) {
      return { success: false, error: "Telegram client not connected" };
    }

    try {
      console.log(`[TELEGRAM] Sending message via proxy to chat ${chatId}`);

      const result = await apiClient.post<any>("/api/v1/telegram?action=send", { chatId, text });

      if (result.success) {
        return {
          success: true,
          messageId: result.data.message_id
        };
      }

      throw new Error(result.error?.message || "API Error");
    } catch (err: any) {
      console.error(`[TELEGRAM] Failed to send message: ${err.message}`);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Check connection status
   */
  isConnectedStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Helper to get the most recent active chat ID as fallback
   */
  getDefaultChatId(): number | null {
    if (this.activeChatId) return this.activeChatId;
    const chats = Array.from(this.internalChats.values());
    if (chats.length > 0) return chats[0].id;
    return null;
  }
}

// Singleton instance
let telegramClientInstance: TelegramClient | null = null;

/**
 * Get or create Telegram client instance
 */
export const getTelegramClient = (): TelegramClient => {
  if (!telegramClientInstance) {
    console.log('[TELEGRAM] Creating new TelegramClient instance');
    telegramClientInstance = new TelegramClient();
  }
  return telegramClientInstance;
};
