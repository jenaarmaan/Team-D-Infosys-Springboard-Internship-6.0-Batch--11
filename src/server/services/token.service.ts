import { getDb } from '../lib/clients/firebase.admin';
import { logger } from '../lib/logger';
import axios from 'axios';

export interface GmailToken {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    connected: boolean;
    email?: string;
}

export class TokenService {
    private clientId = process.env.GOOGLE_CLIENT_ID;
    private clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    constructor() {
        if (!this.clientId) {
            console.error("MISSING ENV VARIABLE: GOOGLE_CLIENT_ID");
            throw new Error("CRITICAL: GOOGLE_CLIENT_ID is undefined.");
        }
        if (!this.clientSecret) {
            console.error("MISSING ENV VARIABLE: GOOGLE_CLIENT_SECRET");
            throw new Error("CRITICAL: GOOGLE_CLIENT_SECRET is undefined.");
        }
    }

    /**
     * Get valid access token for a user
     * Reads from Firestore, refreshes if expired.
     */
    async getValidToken(uid: string): Promise<string> {
        const db = getDb();
        if (!db) throw new Error('DB_NOT_INITIALIZED');

        const doc = await db.collection('gmail_tokens').doc(uid).get();
        if (!doc.exists) {
            throw new Error('GMAIL_NOT_CONNECTED');
        }

        const data = doc.data() as GmailToken;

        // Check for expiration (buffer of 5 minutes)
        const now = Math.floor(Date.now() / 1000);
        if (data.expiresAt && data.expiresAt > now + 300) {
            return data.accessToken;
        }

        // Token expired or about to expire - Try refresh
        if (!data.refreshToken) {
            throw new Error('REFRESH_TOKEN_MISSING');
        }

        return this.refreshToken(uid, data.refreshToken);
    }

    /**
     * Refresh OAuth2 token using Google API
     */
    private async refreshToken(uid: string, refreshToken: string): Promise<string> {
        if (!this.clientId || !this.clientSecret) {
            throw new Error('GOOGLE_API_CREDENTIALS_MISSING');
        }

        try {
            logger.info('Refreshing Gmail token', { uid });
            const response = await axios.post('https://oauth2.googleapis.com/token', {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            });

            const { access_token, expires_in } = response.data;
            const expiresAt = Math.floor(Date.now() / 1000) + expires_in;

            // Update Firestore with new token
            const db = getDb();
            await db.collection('gmail_tokens').doc(uid).set({
                accessToken: access_token,
                expiresAt,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            return access_token;
        } catch (error: any) {
            logger.error('Failed to refresh Gmail token', error, { uid });
            throw new Error('TOKEN_REFRESH_FAILED');
        }
    }
}

export const tokenService = new TokenService();
