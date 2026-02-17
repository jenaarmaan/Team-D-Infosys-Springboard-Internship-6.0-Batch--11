import { getDb } from '../lib/clients/firebase.admin';

/**
 * Enterprise Telegram Service
 */
export class TelegramService {
    private get botToken() {
        return process.env.TELEGRAM_BOT_TOKEN;
    }

    async sendMessage(chatId: string | number, text: string): Promise<any> {
        if (!this.botToken) throw new Error('TELEGRAM_BOT_TOKEN_MISSING');
        try {
            console.log(`📤 [TG SEND] Outgoing to ${chatId}`);
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text }),
            });
            const data = await response.json();
            if (!data.ok) {
                console.error(`❌ [TG API ERR]: ${data.description}`);
                throw new Error(data.description || 'TG_API_ERROR');
            }
            return data.result;
        } catch (error: any) {
            console.error('❌ [TG SEND CRASH]:', error.message);
            throw error;
        }
    }

    async processWebhookUpdate(update: any): Promise<void> {
        const message = update.message || update.edited_message;
        if (!message || !message.text) return;

        const chatId = message.chat.id;
        const text = message.text.trim();
        const updateId = update.update_id;

        console.log(`📡 [TG WEBHOOK] Update ${updateId} | Chat: ${chatId} | Text: "${text}"`);

        try {
            // 1. Resolve UID
            let uid = await this.resolveUidForChat(chatId);

            // 2. Handle Linking
            if (text.toLowerCase().startsWith('/link')) {
                const email = text.split(/\s+/)[1]?.toLowerCase();
                if (email && email.includes('@')) {
                    console.log(`🔗 [TG LINK] Linking ${chatId} -> ${email}`);
                    const linkedUid = await this.linkUserByEmail(chatId, email);
                    if (linkedUid) {
                        await this.sendMessage(chatId, `✅ Success! Your Telegram is now linked to ${email}. Your messages will now sync to the dashboard.`);
                        uid = linkedUid;
                    } else {
                        await this.sendMessage(chatId, `❌ Link failed. No registered account found for ${email}. Please sign up at govindai.vercel.app first.`);
                        return;
                    }
                } else {
                    await this.sendMessage(chatId, "📌 Please use format: /link your_email@example.com");
                    return;
                }
            }

            if (!uid) {
                console.warn(`⚠️ [TG WEBHOOK] Update ${updateId} ignored: No UID linked for chat ${chatId}`);
                return;
            }

            // 3. Save Update (with timeout)
            const db = getDb();
            const docRef = db.collection('telegram_updates').doc(uid).collection('updates').doc(`update_${updateId}`);

            await Promise.race([
                docRef.set({
                    processedAt: new Date().toISOString(),
                    chatId,
                    senderId: message.from.id,
                    senderName: message.from.first_name || 'User',
                    text: message.text,
                    date: message.date,
                    uid,
                    chatTitle: message.chat.title || message.from.first_name || 'Private Chat',
                    chatType: message.chat.type
                }, { merge: true }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("DB_WRITE_TIMEOUT")), 5000))
            ]);

            console.log(`✅ [TG SYNC] Update ${updateId} synced for UID ${uid}`);
        } catch (err: any) {
            console.error(`❌ [TG WEBHOOK CRITICAL]: ${err.message}`);
            // Attempt to notify user of internal failure if we have a chatId
            if (chatId) {
                await this.sendMessage(chatId, `⚠️ Internal System Error: ${err.message}. Please try again in a few minutes.`).catch(() => { });
            }
        }
    }

    async getUpdates(uid: string): Promise<any[]> {
        console.log(`🔍 [TG SERVICE] Fetching updates for UID ${uid}`);
        try {
            const db = getDb();
            const snapshot = await Promise.race([
                db.collection('telegram_updates')
                    .doc(uid)
                    .collection('updates')
                    .orderBy('date', 'desc')
                    .limit(50)
                    .get(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("DB_READ_TIMEOUT")), 6000))
            ]) as any;

            return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        } catch (err: any) {
            console.error(`❌ [GET UPDATES FAIL]: ${err.message}`);
            throw err;
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
            console.error(`❌ [RESOLVE UID FAIL]:`, err);
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
            console.error(`❌ [LINK EMAIL FAIL]:`, err);
            return null;
        }
    }
}
