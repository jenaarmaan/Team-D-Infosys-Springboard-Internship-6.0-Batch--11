import { logger } from '../lib/logger';
import nodemailer from 'nodemailer';
import { getDb } from '../lib/clients/firebase.admin';
import { ImapFlow } from 'imapflow';

/**
 * Enterprise Gmail Service
 * Optimized for Vercel Serverless (high-latency regions like bom1)
 * Uses native fetch with abort signals to prevent Lambda hangs.
 */
class GmailService {
    private GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
    private DEFAULT_TIMEOUT = 20000; // 20 seconds for cross-region fetch

    /**
     * Helper to get fetch headers with user token
     */
    private getHeaders(token: string) {
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }

    /**
     * Create a timeout signal
     */
    private getTimeoutSignal(ms: number = this.DEFAULT_TIMEOUT) {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), ms);
        return controller.signal;
    }

    /**
     * Attempts to retrieve legacy App Password credentials for a user
     */
    private async getLegacyCredentials(uid: string): Promise<{ email: string; appPassword?: string } | null> {
        try {
            const db = await getDb();
            const doc = await db.collection('users').doc(uid).get();
            if (!doc.exists) return null;
            const data = doc.data();
            return {
                email: data?.email || '',
                appPassword: data?.security?.gmailAppPassword
            };
        } catch (err) {
            console.error("[GMAIL] Error fetching legacy credentials:", err);
            return null;
        }
    }

    async listEmails(uid: string, token: string, options: { limit?: number; unread?: boolean; q?: string } = {}) {
        try {
            const { limit = 50, unread = false, q } = options;

            const queryParts = [];
            if (unread) queryParts.push('is:unread');
            if (q) queryParts.push(q);

            let url = `${this.GMAIL_API_BASE}/messages?maxResults=${limit}`;
            if (queryParts.length > 0) {
                url += `&q=${encodeURIComponent(queryParts.join(' '))}`;
            } else {
                url += '&labelIds=INBOX';
            }

            console.log(`📧 [GMAIL] List - Timeout: ${this.DEFAULT_TIMEOUT}ms, URL: ${url}`);

            const response = await fetch(url, {
                headers: this.getHeaders(token),
                signal: this.getTimeoutSignal()
            });

            if (!response.ok) {
                const errorText = await response.text();
                const err = new Error(`Gmail API List Error: ${response.status} - ${errorText}`) as any;
                err.uid = uid;
                throw err;
            }

            const data = await response.json();
            const messages = data.messages || [];

            const listToFetch = messages.slice(0, 15);
            console.log(`📧 [GMAIL SERVICE] Fetching details for ${listToFetch.length} messages...`);
            const emails = await Promise.all(
                listToFetch.map(async (msg: any) => {
                    try {
                        const detailRes = await fetch(`${this.GMAIL_API_BASE}/messages/${msg.id}?format=metadata`, {
                            headers: this.getHeaders(token),
                            signal: this.getTimeoutSignal(5000)
                        });
                        if (!detailRes.ok) return null;

                        const detail = await detailRes.json();
                        const payload = detail.payload;
                        if (!payload) return null;

                        const headers = payload.headers || [];
                        const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || '';

                        return {
                            id: msg.id,
                            threadId: detail.threadId,
                            from: getHeader('From'),
                            subject: getHeader('Subject'),
                            date: getHeader('Date'),
                            snippet: detail.snippet,
                            isUnread: detail.labelIds?.includes('UNREAD')
                        };
                    } catch (e: any) {
                        console.warn(`⚠️ [GMAIL] Detail fetch failed for ${msg.id}: ${e.message}`);
                        return null;
                    }
                })
            );

            return emails.filter(Boolean);
        } catch (error: any) {
            error.uid = uid;
            console.warn(`[GMAIL] OAuth fetching failed: ${error.message}. Checking for legacy fallback...`);

            if (error.uid) {
                const creds = await this.getLegacyCredentials(error.uid);
                if (creds?.appPassword) {
                    console.log(`🚀 [GMAIL] Attempting legacy IMAP fetch for ${creds.email}...`);
                    try {
                        return await this.listEmailsViaImap(creds.email, creds.appPassword, options);
                    } catch (imapErr: any) {
                        console.error("❌ [GMAIL IMAP FAILED] Legacy fallback failed:", imapErr.message);
                        throw new Error(`GMAIL_FETCH_FAILURE: OAuth failed AND App Password IMAP failed (${imapErr.message})`);
                    }
                }
            }

            if (error.name === 'AbortError') {
                console.error("🛑 [GMAIL] Request timed out");
                throw new Error("GMAIL_TIMEOUT");
            }
            logger.error('Gmail list failed', error);
            throw error;
        }
    }

    private async listEmailsViaImap(email: string, appPassword: string, options: any) {
        const client = new ImapFlow({
            host: 'imap.gmail.com',
            port: 993,
            secure: true,
            auth: { user: email, pass: appPassword },
            logger: false
        });

        await client.connect();
        const mailbox = await client.mailboxOpen('INBOX');
        try {
            const emails = [];
            const startSeq = Math.max(1, mailbox.exists - (options.limit || 10) + 1);
            const generator = client.fetch(`${startSeq}:*`, { envelope: true, bodyStructure: true, flags: true });
            for await (const msg of generator) {
                emails.push({
                    id: msg.uid.toString(),
                    threadId: (msg as any).threadId?.toString() || msg.uid.toString(),
                    from: msg.envelope.from[0]?.name || msg.envelope.from[0]?.address || 'Unknown',
                    subject: msg.envelope.subject || '(No Subject)',
                    date: msg.envelope.date.toISOString(),
                    snippet: '',
                    isUnread: !msg.flags.has('\\Seen'),
                    legacy: true
                });
            }
            return emails.reverse();
        } finally {
            await client.logout();
        }
    }

    async getEmail(uid: string, token: string, messageId: string) {
        try {
            const response = await fetch(`${this.GMAIL_API_BASE}/messages/${messageId}?format=full`, {
                headers: this.getHeaders(token),
                signal: this.getTimeoutSignal()
            });
            if (!response.ok) {
                const errorText = await response.text();
                const err = new Error(`Gmail API Get Error: ${response.status} - ${errorText}`) as any;
                err.uid = uid;
                throw err;
            }

            const data = await response.json();
            const payload = data.payload;
            const headers = payload?.headers || [];
            const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || '';

            return {
                id: messageId,
                threadId: data.threadId,
                from: getHeader('From'),
                to: getHeader('To'),
                subject: getHeader('Subject'),
                date: getHeader('Date'),
                body: this.extractBody(payload)
            };
        } catch (error: any) {
            error.uid = uid;
            if (error.uid) {
                const creds = await this.getLegacyCredentials(error.uid);
                if (creds?.appPassword) {
                    console.log(`🚀 [GMAIL] Attempting legacy IMAP single fetch for ${creds.email}...`);
                    try {
                        return await this.getEmailViaImap(creds.email, creds.appPassword, messageId);
                    } catch (imapErr: any) {
                        console.error("❌ [GMAIL IMAP GET FAILED] Legacy fallback failed:", imapErr.message);
                        throw new Error(`GMAIL_GET_FAILURE: OAuth failed AND App Password IMAP failed (${imapErr.message})`);
                    }
                }
            }
            if (error.name === 'AbortError') throw new Error("GMAIL_TIMEOUT");
            logger.error('Gmail get failed', error);
            throw error;
        }
    }

    private async getEmailViaImap(email: string, appPassword: string, uid: string) {
        const client = new ImapFlow({
            host: 'imap.gmail.com',
            port: 993,
            secure: true,
            auth: { user: email, pass: appPassword },
            logger: false
        });

        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        try {
            const msg = await client.fetchOne(uid, { envelope: true, source: true });
            if (!msg) throw new Error("Email not found via IMAP");

            return {
                id: uid,
                threadId: msg.threadId || uid,
                from: msg.envelope.from[0]?.address || 'Unknown',
                to: msg.envelope.to[0]?.address || '',
                subject: msg.envelope.subject || '(No Subject)',
                date: msg.envelope.date.toISOString(),
                body: msg.source.toString(),
                legacy: true
            };
        } finally {
            lock.release();
            await client.logout();
        }
    }

    async sendEmail(uid: string, token: string, { to, subject, body }: { to: string; subject: string; body: string }) {
        try {
            const rawMessage = [
                `To: ${to}`,
                `Subject: ${subject}`,
                'Content-Type: text/plain; charset="UTF-8"',
                '',
                body
            ].join('\r\n');

            const encodedMessage = Buffer.from(rawMessage)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            const response = await fetch(`${this.GMAIL_API_BASE}/messages/send`, {
                method: 'POST',
                headers: this.getHeaders(token),
                body: JSON.stringify({ raw: encodedMessage }),
                signal: this.getTimeoutSignal(10000)
            });

            if (!response.ok) {
                const errorText = await response.text();
                const err = new Error(`Gmail API Send Error: ${response.status} - ${errorText}`) as any;
                err.uid = uid;
                throw err;
            }

            return await response.json();
        } catch (error: any) {
            error.uid = uid;
            if (error.uid) {
                const creds = await this.getLegacyCredentials(error.uid);
                if (creds?.appPassword) {
                    try {
                        const transporter = nodemailer.createTransport({
                            service: 'gmail',
                            auth: { user: creds.email, pass: creds.appPassword }
                        });

                        const info = await transporter.sendMail({
                            from: creds.email,
                            to,
                            subject: `[LEGACY] ${subject}`,
                            text: body
                        });

                        return { legacy: true, messageId: info.messageId };
                    } catch (smtpErr: any) {
                        throw new Error(`GMAIL_TOTAL_FAILURE: SMTP fallback failed (${smtpErr.message})`);
                    }
                }
            }
            if (error.name === 'AbortError') throw new Error("GMAIL_TIMEOUT");
            logger.error('Gmail send failed', error);
            throw error;
        }
    }

    async replyEmail(uid: string, token: string, { threadId, to, subject, body }: { threadId: string; to: string; subject: string; body: string }) {
        try {
            const rawMessage = [
                `To: ${to}`,
                `Subject: Re: ${subject}`,
                `In-Reply-To: ${threadId}`,
                `References: ${threadId}`,
                'Content-Type: text/plain; charset="UTF-8"',
                '',
                body
            ].join('\r\n');

            const encodedMessage = Buffer.from(rawMessage)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            const response = await fetch(`${this.GMAIL_API_BASE}/messages/send`, {
                method: 'POST',
                headers: this.getHeaders(token),
                body: JSON.stringify({
                    raw: encodedMessage,
                    threadId
                }),
                signal: this.getTimeoutSignal(10000)
            });

            if (!response.ok) {
                const errorText = await response.text();
                const err = new Error(`Gmail API Reply Error: ${response.status} - ${errorText}`) as any;
                err.uid = uid;
                throw err;
            }

            return await response.json();
        } catch (error: any) {
            error.uid = uid;
            if (error.name === 'AbortError') throw new Error("GMAIL_TIMEOUT");
            logger.error('Gmail reply failed', error);
            throw error;
        }
    }

    async markAsRead(uid: string, token: string, messageId: string) {
        try {
            const response = await fetch(`${this.GMAIL_API_BASE}/messages/${messageId}/modify`, {
                method: 'POST',
                headers: this.getHeaders(token),
                body: JSON.stringify({
                    removeLabelIds: ['UNREAD']
                }),
                signal: this.getTimeoutSignal(5000)
            });

            if (!response.ok) {
                const errorText = await response.text();
                const err = new Error(`Gmail API MarkRead Error: ${response.status} - ${errorText}`) as any;
                err.uid = uid;
                throw err;
            }

            return { success: true };
        } catch (error: any) {
            error.uid = uid;
            if (error.name === 'AbortError') throw new Error("GMAIL_TIMEOUT");
            logger.error('Gmail markRead failed', error);
            throw error;
        }
    }

    private extractBody(payload: any): string {
        if (!payload) return '';
        if (payload.mimeType === 'text/plain' && payload.body?.data) {
            return Buffer.from(payload.body.data, 'base64').toString('utf-8');
        }
        if (payload.parts) {
            for (const part of payload.parts) {
                if (part.mimeType === 'text/plain' && part.body?.data) {
                    return Buffer.from(part.body.data, 'base64').toString('utf-8');
                }
            }
        }
        return '';
    }
}

export const gmailService = new GmailService();
