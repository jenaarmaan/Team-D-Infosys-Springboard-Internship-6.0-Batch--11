import { logger } from '../lib/logger';

class GmailService {
    private GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

    /**
     * Helper to get fetch headers with user token
     */
    private getHeaders(token: string) {
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }

    async listEmails(token: string, options: { limit?: number; unread?: boolean; q?: string } = {}) {
        try {
            const { limit = 50, unread = false, q } = options;

            // Build the query
            const queryParts = [];
            if (unread) queryParts.push('is:unread');
            if (q) queryParts.push(q);

            let url = `${this.GMAIL_API_BASE}/messages?maxResults=${limit}`;
            if (queryParts.length > 0) {
                url += `&q=${encodeURIComponent(queryParts.join(' '))}`;
            } else {
                url += '&labelIds=INBOX';
            }

            logger.info('Gmail List Request', { url });

            const response = await fetch(url, { headers: this.getHeaders(token) });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gmail API List Error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            const messages = data.messages || [];

            // Detailed fetch for each
            // Reduced to 2 for extreme safety in cold-start serverless context
            console.log(`📧 [GMAIL SERVICE] Fetching details for ${messages.length} messages (limiting to 2)...`);
            const emails = await Promise.all(
                messages.slice(0, 2).map(async (msg: any) => {
                    try {
                        const detailRes = await fetch(`${this.GMAIL_API_BASE}/messages/${msg.id}?format=metadata`, {
                            headers: this.getHeaders(token)
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
                        logger.warn(`Failed to fetch metadata for message ${msg.id}`, { error: e.message });
                        return null;
                    }
                })
            );

            return emails.filter(Boolean);
        } catch (error: any) {
            logger.error('Gmail list failed', error);
            throw error;
        }
    }

    async getEmail(token: string, messageId: string) {
        try {
            const response = await fetch(`${this.GMAIL_API_BASE}/messages/${messageId}?format=full`, {
                headers: this.getHeaders(token)
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
                body: JSON.stringify({ raw: encodedMessage })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gmail API Send Error: ${response.status} - ${errorText}`);
            }

            return await response.json();
        } catch (error: any) {
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
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gmail API Reply Error: ${response.status} - ${errorText}`);
            }

            return await response.json();
        } catch (error: any) {
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
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gmail API MarkRead Error: ${response.status} - ${errorText}`);
            }

            return { success: true };
        } catch (error: any) {
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
