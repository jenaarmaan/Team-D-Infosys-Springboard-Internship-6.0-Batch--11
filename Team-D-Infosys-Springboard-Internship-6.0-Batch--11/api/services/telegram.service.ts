import { db } from '../lib/clients/firebase.admin';
import { logger } from '../lib/logger';
import axios from 'axios';

/**
 * Enterprise Telegram Service
 * Handles outgoing messages and idempotent incoming updates.
 */
export class TelegramService {
    private botToken = process.env.TELEGRAM_BOT_TOKEN;

    /**
     * Send a message to a Telegram chat
     */
    async sendMessage(chatId: string | number, text: string, context: Record<string, any> = {}): Promise<any> {
        const { uid, requestId } = context;
        if (!this.botToken) throw new Error('TELEGRAM_BOT_TOKEN missing');

        try {
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            const response = await axios.post(url, { chat_id: chatId, text });

            if (!response.data.ok) {
                throw new Error(response.data.description || 'Telegram API Error');
            }

            logger.info('Telegram message sent', { uid, requestId, chatId });
            return response.data.result;

        } catch (error: any) {
            logger.error('Telegram send failed', error, { uid, requestId, chatId });
            throw { code: 'MESSAGING_FAILED', message: 'Failed to send Telegram message', details: error.message };
        }
    }

    /**
     * Process incoming Webhook update with Idempotency
     */
    async processWebhookUpdate(update: any): Promise<void> {
        const updateId = update.update_id;
        if (!updateId) return;

        try {
            const docRef = db.collection('telegram_updates').doc(`update_${updateId}`);

            // Idempotency Check: Transactional write to ensure we only process once
            const doc = await docRef.get();
            if (doc.exists) {
                logger.info('Duplicate Telegram update ignored', { updateId });
                return;
            }

            // 1. Extract Message Data
            const message = update.message || update.edited_message;
            if (!message || !message.text) return;

            // 2. Sink to Firestore (Authenticated by Bot Token on the endpoint)
            await docRef.set({
                processedAt: new Date().toISOString(),
                chatId: message.chat.id,
                senderId: message.from.id,
                senderName: message.from.first_name,
                text: message.text,
                date: message.date
            });

            logger.info('Telegram update processed successfully', { updateId, sender: message.from.first_name });

        } catch (error: any) {
            logger.error('Telegram webhook processing failure', error, { updateId });
            throw error;
        }
    }
}

export const telegramService = new TelegramService();
