import { getDb } from '../lib/clients/firebase.admin';
import { logger } from '../lib/logger';

/**
 * Enterprise Telegram Service
 * Handles outgoing messages and idempotent incoming updates.
 */
export class TelegramService {
    private get botToken() {
        return process.env.TELEGRAM_BOT_TOKEN;
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
                body: JSON.stringify({ chat_id: chatId, text }),
                signal: AbortSignal.timeout(8000) // 8s timeout
            });

            console.log(`📡 [TELEGRAM API] Send Status: ${response.status}`);
            const data = await response.json();

            if (!data.ok) {
                console.error(`🛑 [TELEGRAM API ERROR]:`, data);
                throw new Error(data.description || 'Telegram API Error');
            }

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
        if (!db) throw new Error('DB_NOT_READY');

        try {
            const message = update.message || update.edited_message;
            if (!message || !message.text) return;

            const chatId = message.chat.id;
            let uid = await this.resolveUidForChat(chatId);

            // ACCOUNT LINKING
            if (message.text.startsWith('/link')) {
                const email = message.text.replace('/link', '').trim();
                if (email) {
                    const linkedUid = await this.linkUserByEmail(chatId, email);
                    if (linkedUid) {
                        await this.sendMessage(chatId, `✅ Connection established! Account linked to ${email}.`);
                        uid = linkedUid;
                    } else {
                        await this.sendMessage(chatId, `❌ Link failed. No account found for ${email}.`);
                        return;
                    }
                } else {
                    await this.sendMessage(chatId, "📌 Send: /link your_email@example.com");
                    return;
                }
            }

            if (!uid) {
                console.warn(`⚠️ [TG WEBHOOK] No UID link for chatId ${chatId}`);
                return;
            }

            const docRef = db.collection('telegram_updates').doc(uid).collection('updates').doc(`update_${updateId}`);

            // Check existence without full doc fetch if possible (optimized)
            const exists = (await docRef.get()).exists;
            if (exists) return;

            await docRef.set({
                processedAt: new Date().toISOString(),
                chatId,
                senderId: message.from.id,
                senderName: message.from.first_name,
                text: message.text,
                date: message.date,
                uid,
                chatTitle: message.chat.title || `${message.chat.first_name || ''} ${message.chat.last_name || ''}`.trim(),
                chatType: message.chat.type
            });

            console.log(`📡 [TG WEBHOOK] Update ${updateId} synced for ${uid}`);
        } catch (error: any) {
            console.error('🛑 [TG WEBHOOK SERVICE FAIL]:', error.message);
            throw error;
        }
    }

    /**
     * Fetch recent updates for a user
     */
    async getUpdates(uid: string, limit: number = 50): Promise<any[]> {
        const db = getDb();
        try {
            console.log(`🔍 [TG SERVICE] Fetching updates for ${uid}`);
            // Use a simple query to avoid index latency
            const snapshot = await db.collection('telegram_updates')
                .doc(uid)
                .collection('updates')
                .limit(limit)
                .get();

            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            logger.error('Failed to fetch updates', error, { uid });
            return [];
        }
    }

    private async resolveUidForChat(chatId: number): Promise<string | null> {
        const db = getDb();
        try {
            const snapshot = await db.collection('users')
                .where('telegramChatId', '==', chatId)
                .limit(1)
                .get();

            if (snapshot.empty) {
                const globalLink = await db.collection('telegram_config').doc('mappings').get();
                const mappings = globalLink.data() as Record<string, string>;
                return (mappings && mappings[chatId.toString()]) || null;
            }

            return snapshot.docs[0].id;
        } catch (err) {
            return null;
        }
    }

    private async linkUserByEmail(chatId: number, email: string): Promise<string | null> {
        const db = getDb();
        try {
            const snapshot = await db.collection('users')
                .where('email', '==', email.toLowerCase())
                .limit(1)
                .get();

            if (snapshot.empty) return null;

            const userDoc = snapshot.docs[0];
            await userDoc.ref.update({
                telegramChatId: chatId,
                'connectedApps.telegram': true,
                updatedAt: new Date().toISOString()
            });

            return userDoc.id;
        } catch (err) {
            return null;
        }
    }
}

// REMOVED top-level instantiation to prevent module initialization crashes
// We will instantiate inside the handler
