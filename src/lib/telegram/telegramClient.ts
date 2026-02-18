import { TelegramConfig, TelegramMessage, TelegramChat, TelegramSendResult, TelegramUser } from "./telegramTypes";
import { apiClient } from "@/api/client";

/**
 * Telegram Client Wrapper
 */
export class TelegramClient {
  private isConnected: boolean = false;
  private internalMessages: Record<number, TelegramMessage[]> = {};
  private internalChats: Map<number, TelegramChat> = new Map();
  public activeChatId: number | null = null;

  constructor() { }

  async connect(): Promise<void> {
    this.isConnected = true;
    console.log("[TELEGRAM] Connected in production mode");
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    console.log("[TELEGRAM] Disconnected");
  }

  updateCacheFromFirestore(update: any) {
    const rawChatId = update.chatId || update.chat_id;
    if (!rawChatId) {
      console.warn("⚠️ [TG CLIENT] Update missing chatId:", update);
      return;
    }

    const chatId = Number(rawChatId);
    const { senderId, senderName, text, date, chatTitle, chatType, id } = update;

    // 1. Update Chat
    const existing = this.internalChats.get(chatId);
    const newChat: TelegramChat = {
      id: chatId,
      title: chatTitle || existing?.title || senderName || "Private Chat",
      isPrivate: chatType === "private",
      isSupergroup: chatType === "supergroup" || chatType === "channel",
      unreadCount: existing ? (text && text !== existing.lastMessage ? (existing.unreadCount || 0) + 1 : existing.unreadCount) : (text ? 1 : 0),
      lastMessage: text || existing?.lastMessage || "[Update]"
    };

    this.internalChats.set(chatId, newChat);
    console.log(`📝 [TG CLIENT] Cache updated for chat ${chatId}. Total chats: ${this.internalChats.size}`);

    // 2. Update Message
    if (text || id) {
      if (!this.internalMessages[chatId]) this.internalMessages[chatId] = [];

      const exists = this.internalMessages[chatId].some(m => m.id === id);
      if (!exists) {
        this.internalMessages[chatId].push({
          id,
          chatId,
          senderId,
          senderName,
          text,
          date: date?.toDate ? date.toDate() : (typeof date === "number" ? new Date(date * 1000) : new Date(date))
        });
        this.internalMessages[chatId].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 100);
      }
    }
  }

  async getRecentContext(): Promise<{ chats: TelegramChat[], messages: Record<number, TelegramMessage[]> }> {
    const result = await apiClient.post<any>("/api/v1/telegram?action=updates", { limit: 100 });

    if (!result.success) {
      const errorMsg = result.error?.message || "Sync error";
      console.error("[TELEGRAM CLIENT] Sync Failed:", errorMsg);
      throw new Error(errorMsg);
    }

    if (Array.isArray(result.data)) {
      result.data.forEach((upd: any) => this.updateCacheFromFirestore(upd));
    }

    return {
      chats: Array.from(this.internalChats.values()),
      messages: { ...this.internalMessages }
    };
  }

  getRecentContextLocally() {
    return {
      chats: Array.from(this.internalChats.values()),
      messages: { ...this.internalMessages }
    };
  }

  async sendMessage(chatId: number, text: string): Promise<TelegramSendResult> {
    try {
      const result = await apiClient.post<any>("/api/v1/telegram?action=send", { chatId, text });
      if (!result.success) throw new Error(result.error?.message || "Proxy error");
      return { success: true, messageId: result.data.message_id };
    } catch (err: any) {
      console.error("[TELEGRAM] Send failed:", err.message);
      return { success: false, error: err.message };
    }
  }

  isConnectedStatus(): boolean {
    return this.isConnected;
  }

  getDefaultChatId(): number {
    const defaultId = import.meta.env.VITE_TELEGRAM_DEFAULT_CHAT_ID ||
      import.meta.env.TELEGRAM_DEFAULT_CHAT_ID ||
      "-1";
    return parseInt(defaultId, 10);
  }

  async getChats(): Promise<any[]> {
    await this.getRecentContext();
    return Array.from(this.internalChats.values());
  }

  async getMessages(chatId: number, limit: number = 50): Promise<any[]> {
    await this.getRecentContext();
    return (this.internalMessages[chatId] || []).slice(0, limit);
  }
}

let telegramClientInstance: TelegramClient | null = null;
export const getTelegramClient = (): TelegramClient => {
  if (!telegramClientInstance) telegramClientInstance = new TelegramClient();
  return telegramClientInstance;
};
