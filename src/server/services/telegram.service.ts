import { getDb } from '../lib/clients/firebase.admin';
import { logger } from '../lib/logger';

/**
 * Enterprise Telegram Service
 */
export class TelegramService {
    private get botToken() {
        return process.env.TELEGRAM_BOT_TOKEN;
    }

    async sendMessage(chatId: string | number, text: string, context: Record<string, any> = {}): Promise<any> {
        if (!this.botToken) throw new Error('TELEGRAM_BOT_TOKEN_MISSING');
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
            console.error('❌ [TG SEND FAIL]:', error.message);
            throw error;
        }
    }

    async processWebhookUpdate(update: any): Promise<void> {
        const updateId = update.update_id;
        const message = update.message || update.edited_message;
        if (!message || !message.text) return;

        const chatId = message.chat.id;
        let text = message.text.trim();

        // 1. Resolve UID
        let uid = await this.resolveUidForChat(chatId);

        // 2. Handle Linking (Improved Parsing)
        if (text.toLowerCase().startsWith('/link')) {
            // Regex to handle /link email or /link@botname email
            const parts = text.split(/\s+/);
            const email = parts.length > 1 ? parts[1].toLowerCase() : null;

            if (email && email.includes('@')) {
                console.log(`🔗 [TG LINK] Attempt for ${chatId} -> ${email}`);
                const linkedUid = await this.linkUserByEmail(chatId, email);
                if (linkedUid) {
                    await this.sendMessage(chatId, `✅ Success! Your Telegram is now linked to ${email}. You can now view your messages on the dashboard.`);
                    uid = linkedUid;
                } else {
                    await this.sendMessage(chatId, `❌ Link failed. No account found for ${email}. Sign up at govindai.vercel.app first.`);
                    return;
                }
            } else {
                await this.sendMessage(chatId, "📌 Please send: /link your_email@example.com");
                return;
            }
        }

        if (!uid) return;

        // 3. Save Update
        try {
            const db = getDb();
            const docId = `update_${updateId}`;
            const docRef = db.collection('telegram_updates').doc(uid).collection('updates').doc(docId);

            const doc = await docRef.get();
            if (doc.exists) return;

            await docRef.set({
                processedAt: new Date().toISOString(),
                chatId,
                senderId: message.from.id,
                senderName: message.from.first_name || 'User',
                text: message.text,
                date: message.date,
                uid,
                chatTitle: message.chat.title || message.from.first_name || 'Private Chat',
                chatType: message.chat.type
            });
            console.log(`✅ [TG SYNC] Update ${updateId} synced for ${uid}`);
        } catch (err: any) {
            console.error(`❌ [TG SYNC ERR]: ${err.message}`);
        }
    }

    async getUpdates(uid: string, limit: number = 50): Promise<any[]> {
        try {
            const db = getDb();
            const snapshot = await db.collection('telegram_updates')
                .doc(uid)
                .collection('updates')
                .limit(limit)
                .get();

            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error: any) {
            console.error(`❌ [GET UPDATES ERR]: ${error.message}`);
            throw error; // Throw so handler catch and reports it
        }
    }

    private async resolveUidForChat(chatId: number): Promise<string | null> {
        try {
            const db = getDb();
            const snapshot = await db.collection('users')
                .where('telegramChatId', '==', chatId)
                .limit(1)
                .get();

            if (!snapshot.empty) return snapshot.docs[0].id;

            const globalLink = await db.collection('telegram_config').doc('mappings').get();
            const mappings = globalLink.data() as Record<string, string>;
            return (mappings && mappings[chatId.toString()]) || null;
        } catch (err) {
            return null;
        }
    }

    private async linkUserByEmail(chatId: number, email: string): Promise<string | null> {
        try {
            const db = getDb();
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
