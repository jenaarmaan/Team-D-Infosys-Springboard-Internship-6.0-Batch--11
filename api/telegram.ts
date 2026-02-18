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

        console.log(`📡 [WEBHOOK] Processing update ${updateId} for chat ${chatId}`);

        try {
            let uid = await this.resolveUidForChat(chatId);

            // Handle /link Command
            if (text.toLowerCase().startsWith('/link')) {
                const parts = text.split(/\s+/);
                const email = parts.length > 1 ? parts[1].toLowerCase() : null;

                if (email && email.includes('@')) {
                    const linkedUid = await this.linkUserByEmail(chatId, email);
                    if (linkedUid) {
                        await this.sendMessage(chatId, `✅ Success! Linked to ${email}. Syncing now...`);
                        uid = linkedUid;
                    } else {
                        await this.sendMessage(chatId, `❌ Link failed. No account found for ${email}.`);
                        return;
                    }
                } else {
                    await this.sendMessage(chatId, `ℹ️ Usage: /link your_email@example.com`);
                    return;
                }
            }

            if (!uid) {
                console.warn(`⚠️ [WEBHOOK] No UID found for chat ${chatId}. User must /link first.`);
                return;
            }

            const db = await getDb();
            const docRef = db.collection('telegram_updates').doc(uid).collection('updates').doc(`update_${updateId}`);

            await Promise.race([
                docRef.set({
                    processedAt: new Date().toISOString(),
                    chatId,
                    senderId: message.from.id,
                    senderName: message.from.first_name || 'User',
                    text: message.text,
                    date: message.date, // Unix timestamp from TG
                    uid,
                    chatTitle: message.chat.title || message.from.first_name || 'Chat',
                    chatType: message.chat.type
                }, { merge: true }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("FIREBASE_TIMEOUT")), 8000))
            ]);

            console.log(`✅ [WEBHOOK] Saved update ${updateId} for UID ${uid}`);
        } catch (err: any) {
            console.error(`❌ [WEBHOOK ERR]: ${err.message}`);
        }
    }

    async getUpdates(uid: string): Promise<any[]> {
        try {
            const db = await getDb();
            const snapshot = await db.collection('telegram_updates')
                .doc(uid)
                .collection('updates')
                .orderBy('date', 'desc')
                .limit(50)
                .get();

            return snapshot.docs.map((doc: any) => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (err: any) {
            console.error(`❌ [GET UPDATES ERR]: ${err.message}`);
            throw err;
        }
    }

    private async resolveUidForChat(chatId: number): Promise<string | null> {
        try {
            const db = await getDb();
            // Try user collection first
            const snapshot = await db.collection('users').where('telegramChatId', '==', chatId).limit(1).get();
            if (!snapshot.empty) return snapshot.docs[0].id;

            // Try legacy mappings
            const config = await db.collection('telegram_config').doc('mappings').get();
            const mappings = config.data() as Record<string, string>;
            return (mappings && mappings[chatId.toString()]) || null;
        } catch (e: any) {
            console.error(`❌ [RESOLVE UID ERR]: ${e.message}`);
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

            // Also update the global mapping for faster lookups
            await db.collection('telegram_config').doc('mappings').set({
                [chatId.toString()]: userDoc.id
            }, { merge: true });

            return userDoc.id;
        } catch (e: any) {
            console.error(`❌ [LINK ERR]: ${e.message}`);
            return null;
        }
    }
}

/* --- 3. MAIN HANDLER --- */

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;
    const host = req.headers.host || 'govindai.vercel.app';
    const protocol = host.includes('localhost') ? 'http' : 'https';

    console.log(`📡 [TG API] -> ${req.method} ${action || 'webhook'} | Region: ${process.env.VERCEL_REGION || 'local'}`);

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: { message: 'POST Required' } });

    // ⚡ ACTION: STATUS (Ultra-Fast diagnostics)
    if (action === 'status') {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
        let repairStatus = "idle";

        if (botToken && !host.includes('localhost')) {
            try {
                const webhookUrl = `${protocol}://${host}/api/v1/telegram`;
                const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: webhookUrl,
                        secret_token: secret || undefined,
                        allowed_updates: ['message', 'edited_message']
                    })
                });
                const data = await tgRes.json();
                repairStatus = data.ok ? "Success" : `Fail: ${data.description}`;
            } catch (e: any) { repairStatus = `Err: ${e.message}`; }
        }

        return res.status(200).json({
            success: true,
            data: {
                hasBotToken: !!botToken,
                region: process.env.VERCEL_REGION,
                webhookStatus: repairStatus,
                node: process.version,
                env_check: {
                    hasSecret: !!secret,
                    hasSA: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY
                }
            }
        });
    }

    const service = new TelegramService();

    // 🛡️ WEBHOOK (Insecure but secret-token checked)
    if (!action || action === 'webhook') {
        const secretToken = req.headers['x-telegram-bot-api-secret-token'];
        const expected = process.env.TELEGRAM_WEBHOOK_SECRET;

        if (expected && secretToken !== expected) {
            console.warn("🚫 [WEBHOOK] Unauthorized (Secret token mismatch)");
            return res.status(401).send('Unauthorized');
        }

        try {
            const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            if (!update) return res.status(200).send('EMPTY_BODY');

            await service.processWebhookUpdate(update);
            return res.status(200).send('OK');
        } catch (err: any) {
            console.error("🛑 [WEBHOOK CRASH]:", err.message);
            return res.status(200).send('INTERNAL_ERR');
        }
    }

    // 🔐 AUTHENTICATED ACTIONS (Send / Updates)
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(200).json({ success: false, error: { message: 'Missing Authorization Header', code: 'AUTH_REQUIRED' } });
        }

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
                return res.status(404).json({ success: false, error: { message: 'Action not found' } });
        }
    } catch (err: any) {
        console.error("🛑 [AUTH API CRASH]:", err.message);
        return res.status(200).json({
            success: false,
            error: {
                message: err.message,
                code: err.message === "AUTH_TIMEOUT" ? "LATENCY_TIMEOUT" : "INTERNAL_ERROR",
                uid_check: !!err.uid
            }
        });
    }
}
