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
            console.log('[TELEGRAM] Attempting backend message send...');
            const result = await apiClient.post<any>('/api/v1/telegram?action=send', { chatId, text });
            if (result.success) {
                return {
                    success: true,
                    messageId: result.data.message_id
                };
            }
            console.warn('[TELEGRAM] Backend send failed, falling back to frontend direct fetch.');
        } catch (error: any) {
            console.error('[TELEGRAM PROXY ERROR]', error);
        }

        // Fallback: Direct Telegram Bot API Call
        try {
            const botToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
            if (!botToken) throw new Error('Telegram Bot Token missing for fallback.');

            const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: text })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Telegram API Error: ${response.status} - ${errText}`);
            }

            const data = await response.json();
            return {
                success: true,
                messageId: data.result.message_id
            };
        } catch (fallbackErr: any) {
            console.error('[TELEGRAM FALLBACK ERROR]', fallbackErr);
            return {
                success: false,
                error: fallbackErr.message || 'Direct Telegram send failed'
            };
        }
    }
}

export const telegramProxyClient = new TelegramProxyClient();
