import axios from 'axios';
import { logger } from '../lib/logger';

class GmailService {
    private GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

    /**
     * Helper to get axios config with user token
     */
    private getConfig(token: string) {
        return {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };
    }

    async listEmails(token: string, options: { limit?: number; unread?: boolean } = {}) {
        try {
            const { limit = 50, unread = false } = options;
            let url = `${this.GMAIL_API_BASE}/messages?maxResults=${limit}`;
            if (unread) {
                url += '&q=is:unread label:INBOX';
            } else {
                url += '&labelIds=INBOX';
            }

            const res = await axios.get(url, this.getConfig(token));
            const messages = res.data.messages || [];

            // Detailed fetch for each (optional, but needed for front compatibility)
            const emails = await Promise.all(
                messages.slice(0, 10).map(async (msg: any) => {
                    const detail = await axios.get(`${this.GMAIL_API_BASE}/messages/${msg.id}?format=metadata`, this.getConfig(token));
                    const headers = detail.data.payload.headers;
                    const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || '';

                    return {
                        id: msg.id,
                        threadId: detail.data.threadId,
                        from: getHeader('From'),
                        subject: getHeader('Subject'),
                        date: getHeader('Date'),
                        snippet: detail.data.snippet,
                        isUnread: detail.data.labelIds?.includes('UNREAD')
                    };
                })
            );

            return emails;
        } catch (error: any) {
            logger.error('Gmail list failed', error);
            throw error;
        }
    }

    async getEmail(token: string, messageId: string) {
        try {
            const res = await axios.get(`${this.GMAIL_API_BASE}/messages/${messageId}?format=full`, this.getConfig(token));
            const payload = res.data.payload;
            const headers = payload.headers;
            const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || '';

            return {
                id: messageId,
                threadId: res.data.threadId,
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

            const res = await axios.post(`${this.GMAIL_API_BASE}/messages/send`, { raw: encodedMessage }, this.getConfig(token));
            return res.data;
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

            const res = await axios.post(`${this.GMAIL_API_BASE}/messages/send`, {
                raw: encodedMessage,
                threadId
            }, this.getConfig(token));
            return res.data;
        } catch (error: any) {
            logger.error('Gmail reply failed', error);
            throw error;
        }
    }

    async markAsRead(token: string, messageId: string) {
        try {
            await axios.post(`${this.GMAIL_API_BASE}/messages/${messageId}/modify`, {
                removeLabelIds: ['UNREAD']
            }, this.getConfig(token));
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
