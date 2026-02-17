import { getDb } from '../lib/clients/firebase.admin';
import { logger } from '../lib/logger';

/**
 * Enterprise Telegram Service
 * Optimized for Vercel Serverless and high-latency Firestore operations.
 */
export class TelegramService {
    private get botToken() {
        return process.env.TELEGRAM_BOT_TOKEN;
    }

    /**
     * Send a message to a Telegram chat
     */
    async sendMessage(chatId: string | number, text: string, context: Record<string, any> = {}): Promise<any> {
        if (!this.botToken) throw new Error('TELEGRAM_BOT_TOKEN_MISSING');
        const { uid } = context;

        try {
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text }),
            });

            const data = await response.json();
            if (!data.ok) throw new Error(data.description || 'TG_API_ERROR');
            return data.result;
        } catch (error: any) {
            logger.error('Telegram send failed', error, { uid, chatId });
            throw error;
        }
    }

    /**
     * Webhook Processor
     */
    async processWebhookUpdate(update: any): Promise<void> {
        const updateId = update.update_id;
        if (!updateId) return;

        const db = getDb();
        const message = update.message || update.edited_message;
        if (!message || !message.text) return;

        const chatId = message.chat.id;
        const text = message.text;

        console.log(`📡 [TG WEBHOOK] Update ${updateId} from Chat ${chatId}: "${text.substring(0, 20)}..."`);

        // 1. Resolve UID
        let uid = await this.resolveUidForChat(chatId);

        // 2. Handle Linking Command
        if (text.startsWith('/link')) {
            const email = text.replace('/link', '').trim().toLowerCase();
            if (email) {
                console.log(`🔗 [TG LINK] Linking ${chatId} to ${email}`);
                const linkedUid = await this.linkUserByEmail(chatId, email);
                if (linkedUid) {
                    await this.sendMessage(chatId, `✅ Connection established! Your Telegram is now linked to ${email}.`);
                    uid = linkedUid;
                } else {
                    await this.sendMessage(chatId, `❌ Link failed. No registered account found for ${email}. Please sign up at govindai.vercel.app first.`);
                    return;
                }
            } else {
                await this.sendMessage(chatId, "📌 To link your account, send: /link your_email@example.com");
                return;
            }
        }

        if (!uid) {
            console.warn(`⚠️ [TG WEBHOOK] No UID found for ${chatId}. Update ignored.`);
            return;
        }

        // 3. Save to Firestore (with deduplication)
        try {
            const docId = `update_${updateId}`;
            const docRef = db.collection('telegram_updates').doc(uid).collection('updates').doc(docId);

            // Fast check: prevents double processing
            const exists = (await docRef.get()).exists;
            if (exists) return;

            await docRef.set({
                processedAt: new Date().toISOString(),
                chatId,
                senderId: message.from.id,
                senderName: message.from.first_name || 'Unknown',
                text: message.text,
                date: message.date,
                uid,
                chatTitle: message.chat.title || `${message.from.first_name || ''} ${message.from.last_name || ''}`.trim() || 'Private Chat',
                chatType: message.chat.type
            });

            console.log(`✅ [TG WEBHOOK] Sync complete for UID ${uid}`);
        } catch (err: any) {
            console.error(`❌ [TG SYNC FAIL]:`, err.message);
            throw err;
        }
    }

    /**
     * Fetch updates for frontend
     */
    async getUpdates(uid: string, limit: number = 50): Promise<any[]> {
        const db = getDb();
        try {
            console.log(`🔍 [TG SERVICE] Fetching for UID: ${uid}`);
            const snapshot = await db.collection('telegram_updates')
                .doc(uid)
                .collection('updates')
                .limit(limit)
                .get();

            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error: any) {
            console.error(`❌ [GET UPDATES FAIL]:`, error.message);
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

            if (!snapshot.empty) return snapshot.docs[0].id;

            // Fallback via mappings doc
            const globalLink = await db.collection('telegram_config').doc('mappings').get();
            const mappings = globalLink.data() as Record<string, string>;
            return (mappings && mappings[chatId.toString()]) || null;
        } catch (err) {
            return null;
        }
    }

    private async linkUserByEmail(chatId: number, email: string): Promise<string | null> {
        const db = getDb();
        try {
            const snapshot = await db.collection('users')
                .where('email', '==', email)
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
