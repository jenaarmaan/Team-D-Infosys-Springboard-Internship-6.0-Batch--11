import { apiClient } from '../api/client';

export interface TelegramSendResult {
    success: boolean;
    messageId?: number;
    error?: string;
}

/**
 * Frontend Telegram Client
 * Proxies outgoing messages through the secure /api/v1/telegram/send endpoint.
 * Note: Incoming messages are now handled via Firebase Firestore observers (Webhook flow).
 */
export class TelegramProxyClient {
    async sendMessage(chatId: string | number, text: string): Promise<TelegramSendResult> {
        try {
            const result = await apiClient.post<any>('/telegram/send', { chatId, text });
            return {
                success: true,
                messageId: result.message_id
            };
        } catch (error: any) {
            console.error('[TELEGRAM PROXY ERROR]', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export const telegramProxyClient = new TelegramProxyClient();
