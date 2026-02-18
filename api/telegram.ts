import { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

/* --- 1. CORE CONFIG & FIREBASE LAZY LOADER --- */

let firebaseApp: any = null;

async function getFirebaseAdmin() {
    if (firebaseApp) return firebaseApp;
    const admin = (await import('firebase-admin')).default;
    const existing = admin.apps.find(a => a?.name === 'govind-prod');
    if (existing) {
        firebaseApp = existing;
        return firebaseApp;
    }

    const saKeyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const pId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.projectId || process.env.PROJECT_ID || 'voicemail-f11f3';

    try {
        if (saKeyEnv) {
            let rawJson = saKeyEnv.trim();
            if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.substring(1, rawJson.length - 1);
            if (rawJson.includes('\\n') && !rawJson.includes('\n')) rawJson = rawJson.replace(/\\n/g, '\n');
            const config = JSON.parse(rawJson);
            firebaseApp = admin.initializeApp({ credential: admin.credential.cert(config) }, 'govind-prod');
        } else {
            firebaseApp = admin.initializeApp({ projectId: pId }, 'govind-prod');
        }
        return firebaseApp;
    } catch (fatal: any) {
        if (fatal.code === 'app/duplicate-app') return admin.app('govind-prod');
        if (admin.apps.length > 0) return admin.apps[0];
        throw fatal;
    }
}

const getDb = async () => (await getFirebaseAdmin()).firestore();
const getAuth = async () => (await getFirebaseAdmin()).auth();

/* --- 2. TELEGRAM SERVICE CLASS --- */

class TelegramService {
    private get botToken() { return process.env.TELEGRAM_BOT_TOKEN; }

    async sendMessage(chatId: string | number, text: string): Promise<any> {
        if (!this.botToken) throw new Error('BOT_TOKEN_MISSING');
        const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text }),
        });
        const data = await response.json();
        if (!data.ok) throw new Error(data.description || 'TG_API_ERROR');
        return data.result;
    }

    async processWebhookUpdate(update: any): Promise<void> {
        const message = update.message || update.edited_message;
        if (!message || !message.text) return;
        const chatId = message.chat.id;
        const text = message.text.trim();
        const updateId = update.update_id;

        try {
            let uid = await this.resolveUidForChat(chatId);
            if (text.toLowerCase().startsWith('/link')) {
                const email = text.split(/\s+/)[1]?.toLowerCase();
                if (email && email.includes('@')) {
                    const linkedUid = await this.linkUserByEmail(chatId, email);
                    if (linkedUid) {
                        await this.sendMessage(chatId, `✅ Success! Linked to ${email}.`);
                        uid = linkedUid;
                    } else {
                        await this.sendMessage(chatId, `❌ Link failed. Account not found.`);
                        return;
                    }
                }
            }
            if (!uid) return;
            const db = await getDb();
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
                new Promise((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 7000))
            ]);
        } catch (err: any) { console.error(`❌ [WEBHOOK ERR]: ${err.message}`); }
    }

    async getUpdates(uid: string): Promise<any[]> {
        const db = await getDb();
        const snapshot = await db.collection('telegram_updates').doc(uid).collection('updates').orderBy('date', 'desc').limit(50).get();
        return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    }

    private async resolveUidForChat(chatId: number): Promise<string | null> {
        try {
            const db = await getDb();
            const snapshot = await db.collection('users').where('telegramChatId', '==', chatId).limit(1).get();
            if (!snapshot.empty) return snapshot.docs[0].id;
            const config = await db.collection('telegram_config').doc('mappings').get();
            return (config.data() as any)?.[chatId.toString()] || null;
        } catch { return null; }
    }

    private async linkUserByEmail(chatId: number, email: string): Promise<string | null> {
        try {
            const db = await getDb();
            const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();
            if (snapshot.empty) return null;
            const userDoc = snapshot.docs[0];
            await userDoc.ref.update({ telegramChatId: chatId, 'connectedApps.telegram': true });
            return userDoc.id;
        } catch { return null; }
    }
}

/* --- 3. MAIN HANDLER --- */

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;
    const host = req.headers.host || 'govindai.vercel.app';
    const protocol = host.includes('localhost') ? 'http' : 'https';

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST Required' });

    if (action === 'status') {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        let repairStatus = "idle";
        if (botToken && !host.includes('localhost')) {
            try {
                const webhookUrl = `${protocol}://${host}/api/v1/telegram`;
                const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: webhookUrl, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined })
                });
                const data = await tgRes.json();
                repairStatus = data.ok ? "Success" : `Fail: ${data.description}`;
            } catch (e: any) { repairStatus = `Err: ${e.message}`; }
        }
        return res.status(200).json({ success: true, data: { hasBotToken: !!botToken, region: process.env.VERCEL_REGION, webhookStatus: repairStatus } });
    }

    const service = new TelegramService();

    if (!action || action === 'webhook') {
        const secretToken = req.headers['x-telegram-bot-api-secret-token'];
        if (process.env.TELEGRAM_WEBHOOK_SECRET && secretToken !== process.env.TELEGRAM_WEBHOOK_SECRET) return res.status(401).send('Unauthorized');
        const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        await service.processWebhookUpdate(update);
        return res.status(200).send('OK');
    }

    // Auth Actions (Send/Updates)
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) return res.status(200).json({ success: false, error: 'AUTH_REQUIRED' });
        const idToken = authHeader.split('Bearer ')[1];
        const auth = await getAuth();
        const decoded = await Promise.race([
            auth.verifyIdToken(idToken),
            new Promise((_, reject) => setTimeout(() => reject(new Error("AUTH_TIMEOUT")), 9000))
        ]) as any;

        switch (action) {
            case 'send':
                const s = await service.sendMessage(req.body.chatId, req.body.text);
                return res.status(200).json({ success: true, data: s });
            case 'updates':
                const u = await service.getUpdates(decoded.uid);
                return res.status(200).json({ success: true, data: u });
            default:
                return res.status(404).json({ success: false, error: 'Unknown Action' });
        }
    } catch (err: any) {
        return res.status(200).json({ success: false, error: err.message });
    }
}
