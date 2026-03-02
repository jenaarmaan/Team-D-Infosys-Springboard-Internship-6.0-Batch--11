import { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';

/* --- 1. FIREBASE ADMIN (SELF-CONTAINED) --- */
let firebaseApp: any = null;
async function getFirebaseAdmin() {
    if (firebaseApp) return firebaseApp;
    const admin = (await import('firebase-admin')).default;
    const existing = admin.apps.find(a => a?.name === 'govind-prod');
    if (existing) { firebaseApp = existing; return firebaseApp; }

    const saKeyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const pId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.projectId || process.env.PROJECT_ID || 'voicemail-f11f3';

    try {
        if (saKeyEnv) {
            let rawJson = saKeyEnv.trim();
            // 1. Unwrap Vercel quotes if present
            if (rawJson.startsWith('"') && rawJson.endsWith('"')) {
                rawJson = rawJson.substring(1, rawJson.length - 1);
            }

            // 2. Parse the JSON. 
            // Note: If the string has escaped characters like \n, JSON.parse will handle them.
            // DO NOT manually replace \n with literal newlines before parsing.
            // Critical fix: JSON.parse expects \n to be escaped as \\n in the source string.
            // If the env var value is already a JSON string with \\n, parsing will work.
            const config = JSON.parse(rawJson);
            firebaseApp = admin.initializeApp({ credential: admin.credential.cert(config) }, 'govind-prod');
        } else {
            firebaseApp = admin.initializeApp({ projectId: pId }, 'govind-prod');
        }
        return firebaseApp;
    } catch (err: any) {
        console.error("🛑 [FB ADMIN] Init Failure:", err.message);
        if (err.code === 'app/duplicate-app' || err.message?.includes('already exists')) {
            return admin.app('govind-prod');
        }
        if (admin.apps.length > 0) return admin.apps[0];
        throw err;
    }
}
const getDb = async () => (await getFirebaseAdmin()).firestore();
const getAuth = async () => (await getFirebaseAdmin()).auth();

/* --- 2. LOCAL TOKEN SERVICE --- */
const tokenService = {
    async getValidToken(uid: string): Promise<string> {
        console.log(`🔍 [TOKEN] UID: ${uid}`);
        const db = await getDb();
        const doc = await db.collection('gmail_tokens').doc(uid).get();
        if (!doc.exists) throw new Error('NOT_CONNECTED');
        const data = doc.data() as any;
        const now = Math.floor(Date.now() / 1000);
        if (data.accessToken && (!data.expiresAt || data.expiresAt > now + 300)) return data.accessToken;

        if (!data.refreshToken) throw new Error('REFRESH_TOKEN_MISSING');
        return this.refresh(uid, data.refreshToken);
    },
    async refresh(uid: string, refreshToken: string): Promise<string> {
        const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.VITE_GOOGLE_CLIENT_SECRET;
        if (!clientId || !clientSecret) throw new Error('CREDENTIALS_MISSING');

        const params = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        });

        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });
        if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
        const data = await res.json();
        const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
        const db = await getDb();
        await db.collection('gmail_tokens').doc(uid).set({
            accessToken: data.access_token,
            expiresAt,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        return data.access_token;
    }
};

/* --- 3. LOCAL GMAIL SERVICE --- */
const gmailService = {
    getHeaders(token: string) { return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }; },

    async listEmails(uid: string, token: string, options: any) {
        // 1. If token is provided, we MUST use it (No fallback here, let frontend retry)
        if (token) {
            const { limit = 20, unread = false, q } = options || {};
            let query = unread ? 'is:unread ' : '';
            if (q) query += q;
            const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}${query ? `&q=${encodeURIComponent(query)}` : '&labelIds=INBOX'}`;

            const res = await fetch(url, { headers: this.getHeaders(token) });
            if (!res.ok) throw new Error(`OAUTH_FAILED_${res.status}`);

            const data = await res.json();
            const messages = data.messages || [];

            return await Promise.all(messages.slice(0, 15).map(async (msg: any) => {
                if (!msg?.id) return null;
                try {
                    const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata`, { headers: this.getHeaders(token) });
                    const detail = await detailRes.json();
                    const headers = detail.payload?.headers || [];
                    const getH = (n: string) => headers.find((h: any) => h.name === n)?.value || '';
                    return {
                        id: msg.id,
                        threadId: detail.threadId,
                        from: getH('From'),
                        subject: getH('Subject'),
                        date: getH('Date'),
                        snippet: detail.snippet,
                        isUnread: detail.labelIds?.includes('UNREAD')
                    };
                } catch { return null; }
            })).then(list => list.filter(Boolean));
        }

        // 2. No token provided (or retry failed) -> Try IMAP Fallback
        console.warn(`[GMAIL] No OAuth token provided for UID ${uid}. Using IMAP fallback.`);
        return this.listEmailsViaImap(uid, options);
    },

    async listEmailsViaImap(uid: string, options: any) {
        const db = await getDb();
        const userDoc = await db.collection('users').doc(uid).get();
        const creds = userDoc.data()?.security?.gmailAppPassword;
        const email = userDoc.data()?.email;
        if (!creds || !email) throw new Error('NO_FALLBACK_CREDENTIALS');

        const client = new ImapFlow({
            host: 'imap.gmail.com', port: 993, secure: true,
            auth: { user: email, pass: creds }, logger: false
        });

        // 🔄 Map query to IMAP Path
        const query = options.query || options.q || "";
        let path = "INBOX";
        if (query.includes("is:starred")) path = "[Gmail]/Starred";
        if (query.includes("in:sent")) path = "[Gmail]/Sent Mail";
        if (query.includes("in:draft")) path = "[Gmail]/Drafts";
        if (query.includes("in:trash")) path = "[Gmail]/Trash";

        await client.connect();
        const mailbox = await client.mailboxOpen(path);
        try {
            const emails = [];
            const count = Math.min(mailbox.exists, options.limit || 20);
            const startSeq = Math.max(1, mailbox.exists - count + 1);

            for await (const msg of client.fetch(`${startSeq}:*`, { envelope: true, flags: true })) {
                if (!msg || !msg.envelope) continue;
                emails.push({
                    id: msg.uid?.toString() || Math.random().toString(),
                    threadId: (msg as any).threadId?.toString() || msg.uid?.toString() || "unknown",
                    from: msg.envelope.from?.[0]?.address || 'Unknown',
                    subject: msg.envelope.subject || '(No Subject)',
                    date: msg.envelope.date ? msg.envelope.date.toISOString() : new Date().toISOString(),
                    isUnread: msg.flags ? !msg.flags.has('\\Seen') : true,
                    legacy: true
                });
            }
            return emails.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        } finally { await client.logout(); }
    },

    async getEmail(uid: string, token: string, id: string) {
        if (token) {
            try {
                const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: this.getHeaders(token) });
                if (!res.ok) throw new Error(`OAUTH_GET_FAILED_${res.status}`);
                const data = await res.json();
                const headers = data.payload?.headers || [];
                const getH = (n: string) => headers.find((h: any) => h.name === n)?.value || '';
                return {
                    id, threadId: data.threadId, from: getH('From'), to: getH('To'),
                    subject: getH('Subject'), date: getH('Date'), body: data.snippet || ''
                };
            } catch (err: any) {
                console.error(`[GMAIL][GET] OAuth failed: ${err.message}`);
                throw err;
            }
        }

        // 🔄 IMAP Fallback for reading a single email
        const db = await getDb();
        const userDoc = await db.collection('users').doc(uid).get();
        const creds = userDoc.data()?.security?.gmailAppPassword;
        const email = userDoc.data()?.email;
        if (!creds || !email) throw new Error('NO_FALLBACK_CREDENTIALS');

        const client = new ImapFlow({
            host: 'imap.gmail.com', port: 993, secure: true,
            auth: { user: email, pass: creds }, logger: false
        });
        await client.connect();
        try {
            await client.mailboxOpen('INBOX');
            // In IMAP fallback, 'id' is the UID string
            const msg = await client.fetchOne(id, { envelope: true, source: true });
            if (!msg || !msg.envelope || !msg.source) throw new Error('EMAIL_NOT_FOUND');
            return {
                id,
                from: msg.envelope.from?.[0]?.address || 'Unknown',
                to: msg.envelope.to?.[0]?.address || 'Unknown',
                subject: msg.envelope.subject || '(No Subject)',
                date: msg.envelope.date ? msg.envelope.date.toISOString() : new Date().toISOString(),
                body: msg.source.toString().substring(0, 2000), // Raw source snippet for LLM to parse
                legacy: true
            };
        } finally { await client.logout(); }
    },

    async markAsRead(uid: string, token: string, id: string) {
        if (!token) throw new Error('TOKEN_REQUIRED_FOR_MODIFY');
        const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`, {
            method: 'POST', headers: this.getHeaders(token), body: JSON.stringify({ removeLabelIds: ['UNREAD'] })
        });
        if (!res.ok) throw new Error(`MARK_READ_FAILED_${res.status}`);
        return { success: true };
    },

    async sendEmail(uid: string, token: string, { to, subject, body }: any) {
        if (!token) throw new Error('TOKEN_REQUIRED_FOR_SEND');
        const raw = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\n\r\n${body}`).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, {
            method: 'POST', headers: this.getHeaders(token), body: JSON.stringify({ raw })
        });
        if (!res.ok) throw new Error(`SEND_FAILED_${res.status}`);
        return await res.json();
    }
};

/* --- 4. MAIN HANDLER --- */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    const start = Date.now();
    let requestId = "anonymous";
    try { requestId = crypto.randomUUID(); } catch { requestId = Math.random().toString(36).substring(7); }

    const { action } = req.query;
    const clientToken = req.headers['google-token'] || req.headers['googletoken'];

    console.log(`📨 [GMAIL API][${requestId}] Action: ${action} | Client Token: ${!!clientToken}`);

    try {
        // Auth check
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'AUTH_REQUIRED' });
        const idToken = authHeader.split('Bearer ')[1];
        const auth = await getAuth();
        const decoded = await auth.verifyIdToken(idToken);
        const uid = decoded.uid;

        // Token resolution
        let token = (Array.isArray(clientToken) ? clientToken[0] : clientToken) || "";

        if (!token) {
            try {
                token = await tokenService.getValidToken(uid);
                console.log(`🔑 [GMAIL][${requestId}] Resolved token from Firestore.`);
            } catch (e: any) {
                console.warn(`[GMAIL][${requestId}] Firestore token failed: ${e.message}`);
            }
        }

        switch (action) {
            case 'list':
                const emails = await gmailService.listEmails(uid, token, req.query);
                return res.status(200).json({ success: true, data: { messages: emails } });
            case 'get':
                const email = await gmailService.getEmail(uid, token, req.query.id as string);
                return res.status(200).json({ success: true, data: { messages: [email] } });
            case 'mark-read':
                const bodyRead = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
                await gmailService.markAsRead(uid, token, bodyRead.messageId);
                return res.status(200).json({ success: true });
            case 'send':
                const bodySend = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
                const s = await gmailService.sendEmail(uid, token, bodySend);
                return res.status(200).json({ success: true, data: s });
            case 'status':
                if (token) {
                    const statusRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX`, { headers: gmailService.getHeaders(token) });
                    const statusData = await statusRes.json();
                    return res.status(200).json({ success: true, data: { unreadCount: statusData.threadsUnread || 0 } });
                }
                // Fallback unread count via IMAP
                try {
                    const db = await getDb();
                    const userDoc = await db.collection('users').doc(uid).get();
                    const creds = userDoc.data()?.security?.gmailAppPassword;
                    const email = userDoc.data()?.email;
                    if (creds && email) {
                        const client = new ImapFlow({
                            host: 'imap.gmail.com', port: 993, secure: true,
                            auth: { user: email, pass: creds }, logger: false
                        });
                        await client.connect();
                        const status = await client.status('INBOX', { unseen: true });
                        await client.logout();
                        return res.status(200).json({ success: true, data: { unreadCount: status.unseen || 0 } });
                    }
                } catch (e) {
                    console.error("Status fallback failed:", e);
                }
                return res.status(200).json({ success: true, data: { unreadCount: 0 } });
            default:
                return res.status(400).json({ success: false, error: 'INVALID_ACTION' });
        }
    } catch (error: any) {
        console.error(`🛑 [GMAIL CRASH][${requestId}]:`, error.message);
        return res.status(error.status || 500).json({
            success: false,
            error: error.message,
            requestId,
            latency: Date.now() - start
        });
    }
}
