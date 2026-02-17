import { getDb } from './firebase';

/**
 * Enterprise Telegram Service (Async Firebase Aware)
 */
export class TelegramService {
    private get botToken() { return process.env.TELEGRAM_BOT_TOKEN; }

    async sendMessage(chatId: string | number, text: string): Promise<any> {
        if (!this.botToken) throw new Error('TELEGRAM_BOT_TOKEN_MISSING');
        const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text }),
            });
            const data = await response.json();
            if (!data.ok) throw new Error(data.description || 'TG_API_ERROR');
            return data.result;
        } catch (e: any) {
            console.error("❌ [TG SEND FAIL]:", e.message);
            throw e;
        }
    }

    async processWebhookUpdate(update: any): Promise<void> {
        const message = update.message || update.edited_message;
        if (!message || !message.text) return;

        const chatId = message.chat.id;
        const text = message.text.trim();
        const updateId = update.update_id;

        console.log(`📡 [TG WEBHOOK] Processing ${updateId}`);

        try {
            let uid = await this.resolveUidForChat(chatId);

            // Handle /link Command
            if (text.toLowerCase().startsWith('/link')) {
                const email = text.split(/\s+/)[1]?.toLowerCase();
                if (email && email.includes('@')) {
                    const linkedUid = await this.linkUserByEmail(chatId, email);
                    if (linkedUid) {
                        await this.sendMessage(chatId, `✅ Success! Your account is linked.`);
                        uid = linkedUid;
                    } else {
                        await this.sendMessage(chatId, `❌ Link failed. No account found for ${email}.`);
                        return;
                    }
                }
            }

            if (!uid) return;

            const db = await getDb(); // Async load Firestore
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
                    chatTitle: message.chat.title || message.from.first_name || 'Chat',
                    chatType: message.chat.type
                }, { merge: true }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("FIREBASE_TIMEOUT")), 7000))
            ]);
            console.log(`✅ [TG WEBHOOK] Update ${updateId} synced for ${uid}`);
        } catch (err: any) {
            console.error(`❌ [TG WEBHOOK ERROR]: ${err.message}`);
        }
    }

    async getUpdates(uid: string): Promise<any[]> {
        try {
            const db = await getDb(); // Async load Firestore
            const snapshot = await db.collection('telegram_updates')
                .doc(uid)
                .collection('updates')
                .orderBy('date', 'desc')
                .limit(50)
                .get();

            return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        } catch (e: any) {
            console.error("❌ [TG UPDATES FAIL]:", e.message);
            throw e;
        }
    }

    private async resolveUidForChat(chatId: number): Promise<string | null> {
        try {
            const db = await getDb();
            const snapshot = await db.collection('users').where('telegramChatId', '==', chatId).limit(1).get();
            if (!snapshot.empty) return snapshot.docs[0].id;

            const globalLink = await db.collection('telegram_config').doc('mappings').get();
            const mappings = globalLink.data() as Record<string, string>;
            return (mappings && mappings[chatId.toString()]) || null;
        } catch (e) {
            return null;
        }
    }

    private async linkUserByEmail(chatId: number, email: string): Promise<string | null> {
        try {
            const db = await getDb();
            const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();
            if (snapshot.empty) return null;
            const userDoc = snapshot.docs[0];
            await userDoc.ref.update({
                telegramChatId: chatId,
                'connectedApps.telegram': true,
                updatedAt: new Date().toISOString()
            });
            return userDoc.id;
        } catch (e) {
            return null;
        }
    }
}
