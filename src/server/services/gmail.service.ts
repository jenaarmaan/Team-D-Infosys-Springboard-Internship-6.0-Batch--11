import { logger } from '../lib/logger';

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

    async listEmails(token: string, options: { limit?: number; unread?: boolean; q?: string } = {}) {
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
                throw new Error(`Gmail API List Error: ${response.status} - ${errorText}`);
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
            if (error.name === 'AbortError') {
                console.error("🛑 [GMAIL] Request timed out (Network Latency too high in region)");
                throw new Error("GMAIL_TIMEOUT");
            }
            logger.error('Gmail list failed', error);
            throw error;
        }
    }

    async getEmail(token: string, messageId: string) {
        try {
            const response = await fetch(`${this.GMAIL_API_BASE}/messages/${messageId}?format=full`, {
                headers: this.getHeaders(token),
                signal: this.getTimeoutSignal()
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gmail API Get Error: ${response.status} - ${errorText}`);
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
            if (error.name === 'AbortError') throw new Error("GMAIL_TIMEOUT");
            logger.error('Gmail get failed', error);
            throw error;
        }
    }

    async sendEmail(token: string, { to, subject, body }: { to: string; subject: string; body: string }) {
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
                throw new Error(`Gmail API Send Error: ${response.status} - ${errorText}`);
            }

            console.log(`✅ [GMAIL SEND SUCCESS] Status: ${response.status}`);
            return await response.json();
        } catch (error: any) {
            if (error.name === 'AbortError') throw new Error("GMAIL_TIMEOUT");
            logger.error('Gmail send failed', error);
            throw error;
        }
    }

    async replyEmail(token: string, { threadId, to, subject, body }: { threadId: string; to: string; subject: string; body: string }) {
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
                throw new Error(`Gmail API Reply Error: ${response.status} - ${errorText}`);
            }

            return await response.json();
        } catch (error: any) {
            if (error.name === 'AbortError') throw new Error("GMAIL_TIMEOUT");
            logger.error('Gmail reply failed', error);
            throw error;
        }
    }

    async markAsRead(token: string, messageId: string) {
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
                throw new Error(`Gmail API MarkRead Error: ${response.status} - ${errorText}`);
            }

            return { success: true };
        } catch (error: any) {
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
