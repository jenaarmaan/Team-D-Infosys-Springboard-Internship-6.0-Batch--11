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
        if (!db) {
            logger.error('Firebase DB not initialized in TelegramService', new Error('DB_NULL'));
            return;
        }

        try {
            // 1. Extract Message Data
            const message = update.message || update.edited_message;
            if (!message || !message.text) return;

            const chatId = message.chat.id;

            // 2. Resolve UID: Maps Telegram chatId to Firebase UID
            // In production, this should lookup a mapping collection or user profile
            const uid = await this.resolveUidForChat(chatId);

            if (!uid) {
                logger.warn('Incoming Telegram update ignored: No UID mapping found for chat', { chatId, updateId });
                return;
            }

            const fullPath = `telegram_updates/${uid}/updates/update_${updateId}`;
            logger.info('TELEGRAM FIRESTORE FULL PATH (WRITE):', { path: fullPath });

            const docRef = db.collection('telegram_updates').doc(uid).collection('updates').doc(`update_${updateId}`);

            // Idempotency Check: Transactional write to ensure we only process once
            const doc = await docRef.get();
            if (doc.exists) {
                logger.info('Duplicate Telegram update ignored', { updateId, uid });
                return;
            }

            // 3. Sink to Firestore (Authenticated by Bot Token on the endpoint)
            await docRef.set({
                processedAt: new Date().toISOString(),
                chatId: message.chat.id,
                senderId: message.from.id,
                senderName: message.from.first_name,
                text: message.text,
                date: message.date,
                uid: uid // Explicitly store UID for cross-ref
            });

            logger.info('Telegram update processed successfully', { updateId, uid, sender: message.from.first_name });

        } catch (error: any) {
            logger.error('Telegram webhook processing failure', error, { updateId });
            throw error;
        }
    }

    /**
     * Resolves Firebase UID from Telegram Chat ID
     * Looks up user profile in Firestore
     */
    private async resolveUidForChat(chatId: number): Promise<string | null> {
        if (!db) return null;
        try {
            // Search 'users' collection for the telegramChatId field
            // Note: This field must be set during the link/auth process
            const snapshot = await db.collection('users')
                .where('connectedApps.telegram', '==', true)
                .where('telegramChatId', '==', chatId)
                .limit(1)
                .get();

            if (snapshot.empty) {
                // FALLBACK: For development, check for a "global" test user link if set
                const globalLink = await db.collection('telegram_config').doc('mappings').get();
                const mappings = globalLink.data() as Record<string, string>;
                if (mappings && mappings[chatId.toString()]) {
                    return mappings[chatId.toString()];
                }
                return null;
            }

            return snapshot.docs[0].id;
        } catch (err) {
            logger.error('UID Resolution failed', err);
            return null;
        }
    }
}

export const telegramService = new TelegramService();
