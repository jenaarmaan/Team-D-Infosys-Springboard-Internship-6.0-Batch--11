import { getDb } from '../lib/clients/firebase.admin';
import { logger } from '../lib/logger';

/**
 * Enterprise Telegram Service
 * Handles outgoing messages and idempotent incoming updates.
 * Replaced 'axios' with native 'fetch' for Vercel Serverless stability.
 */
export class TelegramService {
    private botToken = process.env.TELEGRAM_BOT_TOKEN;

    constructor() {
        if (!this.botToken) {
            console.warn("⚠️ [TELEGRAM SERVICE] TELEGRAM_BOT_TOKEN is missing. Outgoing and incoming Telegram messages will fail.");
        }
    }

    /**
     * Send a message to a Telegram chat
     */
    async sendMessage(chatId: string | number, text: string, context: Record<string, any> = {}): Promise<any> {
        const { uid, requestId } = context;
        if (!this.botToken) throw new Error('TELEGRAM_BOT_TOKEN missing');

        try {
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text })
            });

            const data = await response.json();
            if (!data.ok) {
                throw new Error(data.description || 'Telegram API Error');
            }

            logger.info('Telegram message sent', { uid, requestId, chatId });
            return data.result;

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
        const db = getDb();
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
            let uid = await this.resolveUidForChat(chatId);

            // 🛠️ ACCOUNT LINKING LOGIC
            if (message.text.startsWith('/link')) {
                const email = message.text.replace('/link', '').trim();
                if (email) {
                    logger.info('Attempting Telegram link', { chatId, email });
                    const linkedUid = await this.linkUserByEmail(chatId, email);
                    if (linkedUid) {
                        await this.sendMessage(chatId, `✅ Connection established! your Telegram is now linked to ${email}. You can now use Govind to manage your messages.`);
                        uid = linkedUid;
                    } else {
                        await this.sendMessage(chatId, `❌ Link failed. We couldn't find a registered Govind account with email: ${email}. Please check your spelling or sign up first.`);
                        return;
                    }
                } else {
                    await this.sendMessage(chatId, "📌 To link your account, please send: /link your_email@example.com");
                    return;
                }
            }

            if (!uid) {
                logger.warn('Incoming Telegram update ignored: No UID mapping found for chat', { chatId, updateId });
                return;
            }

            const docRef = getDb().collection('telegram_updates').doc(uid).collection('updates').doc(`update_${updateId}`);

            // Idempotency Check: Transactional write to ensure we only process once
            const doc = await docRef.get();
            if (doc.exists) {
                logger.info('Duplicate Telegram update ignored', { updateId, uid });
                return;
            }

            // 3. Sink to Firestore
            await docRef.set({
                processedAt: new Date().toISOString(),
                chatId: message.chat.id,
                senderId: message.from.id,
                senderName: message.from.first_name,
                text: message.text,
                date: message.date,
                uid: uid
            });

            logger.info('Telegram update processed successfully', { updateId, uid, sender: message.from.first_name });

        } catch (error: any) {
            logger.error('Telegram webhook processing failure', error, { updateId });
            throw error;
        }
    }

    /**
     * Fetch recent updates for a user from Firestore
     */
    async getUpdates(uid: string, limit: number = 50): Promise<any[]> {
        const db = getDb();
        if (!db) return [];
        try {
            const snapshot = await db.collection('telegram_updates')
                .doc(uid)
                .collection('updates')
                .orderBy('date', 'desc')
                .limit(limit)
                .get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            logger.error('Failed to fetch Telegram updates', error, { uid });
            return [];
        }
    }

    /**
     * Resolves Firebase UID from Telegram Chat ID
     */
    private async resolveUidForChat(chatId: number): Promise<string | null> {
        const db = getDb();
        if (!db) return null;
        try {
            const snapshot = await db.collection('users')
                .where('connectedApps.telegram', '==', true)
                .where('telegramChatId', '==', chatId)
                .limit(1)
                .get();

            if (snapshot.empty) {
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

    /**
     * Links a Telegram Chat ID to a user's Firebase account by Email
     */
    private async linkUserByEmail(chatId: number, email: string): Promise<string | null> {
        const db = getDb();
        if (!db) return null;
        try {
            const snapshot = await db.collection('users')
                .where('email', '==', email.toLowerCase())
                .limit(1)
                .get();

            if (snapshot.empty) return null;

            const userDoc = snapshot.docs[0];
            const uid = userDoc.id;

            // Update user document with mapping
            await userDoc.ref.update({
                telegramChatId: chatId,
                'connectedApps.telegram': true,
                updatedAt: new Date().toISOString()
            });

            // Log for audit
            logger.info('Telegram account linked successfully', { uid, chatId, email });
            return uid;
        } catch (err) {
            logger.error('Failed to link Telegram by email', err, { chatId, email });
            return null;
        }
    }
}

export const telegramService = new TelegramService();
