import { logger } from '../lib/logger';
import nodemailer from 'nodemailer';
import { getDb } from '../lib/clients/firebase.admin';

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

            // detailed fetches for all IDs found (limit to 15 to stay within Lambda limits)
            const listToFetch = messages.slice(0, 15);
            console.log(`📧 [GMAIL SERVICE] Fetching details for ${listToFetch.length} messages...`);
            const emails = await Promise.all(
                listToFetch.map(async (msg: any) => {
                    try {
                        const detailRes = await fetch(`${this.GMAIL_API_BASE}/messages/${msg.id}?format=metadata`, {
                            headers: this.getHeaders(token),
                            signal: this.getTimeoutSignal(5000) // 5s for parallel metadata
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

            // 🛑 LEGACY FALLBACK ATTEMPT (FETCHING)
            // IMAP is not natively supported in fetch-based environments without a thick library.
            // We follow the user's request: access it, then throw error.
            if (error.uid) {
                const creds = await this.getLegacyCredentials(error.uid);
                if (creds?.appPassword) {
                    throw new Error(`OAUTH_FAILED: Attempted legacy fallback with App Password for ${creds.email}, but IMAP fetching is not implemented. Please reconnect via OAuth.`);
                }
            }

            if (error.name === 'AbortError') {
                console.error("🛑 [GMAIL] Request timed out (Network Latency too high in region)");
                throw new Error("GMAIL_TIMEOUT");
            }
            logger.error('Gmail list failed', error);
            throw error;
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
            // 🛑 LEGACY FALLBACK ATTEMPT (FETCHING)
            error.uid = uid;
            if (error.uid) {
                const creds = await this.getLegacyCredentials(error.uid);
                if (creds?.appPassword) {
                    throw new Error(`OAUTH_FAILED: Cannot fetch email ${messageId} via App Password. Legacy protocol (IMAP) is restricted. Please fix OAuth.`);
                }
            }
            if (error.name === 'AbortError') throw new Error("GMAIL_TIMEOUT");
            logger.error('Gmail get failed', error);
            throw error;
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
                signal: this.getTimeoutSignal(10000) // 10s for send
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ [GMAIL SEND HTTP ERROR] Status: ${response.status}, Body: ${errorText}`);
                const err = new Error(`Gmail API Send Error: ${response.status} - ${errorText}`) as any;
                err.uid = uid;
                throw err;
            }

            console.log(`✅ [GMAIL SEND SUCCESS] Status: ${response.status}`);
            return await response.json();
        } catch (error: any) {
            error.uid = uid;
            console.warn(`[GMAIL] OAuth sending failed: ${error.message}. Attempting SMTP fallback...`);

            // 🛑 LEGACY FALLBACK ATTEMPT (SENDING)
            // SMTP is supported via nodemailer
            if (error.uid) {
                const creds = await this.getLegacyCredentials(error.uid);
                if (creds?.appPassword) {
                    console.log(`🚀 [GMAIL] Attempting legacy SMTP send for ${creds.email}...`);
                    try {
                        const transporter = nodemailer.createTransport({
                            service: 'gmail',
                            auth: {
                                user: creds.email,
                                pass: creds.appPassword
                            }
                        });

                        const info = await transporter.sendMail({
                            from: creds.email,
                            to,
                            subject: `[LEGACY] ${subject}`,
                            text: body
                        });

                        console.log(`✅ [GMAIL SMTP SUCCESS] Message sent: ${info.messageId}`);
                        return { legacy: true, messageId: info.messageId };
                    } catch (smtpErr: any) {
                        console.error("❌ [GMAIL SMTP FAILED] Legacy fallback failed:", smtpErr.message);
                        throw new Error(`GMAIL_TOTAL_FAILURE: OAuth failed AND App Password SMTP failed (${smtpErr.message})`);
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
