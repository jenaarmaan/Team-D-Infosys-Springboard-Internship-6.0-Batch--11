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
    private clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
    private clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.VITE_GOOGLE_CLIENT_SECRET;

    constructor() {
        if (!this.clientId) {
            console.warn("⚠️ [TOKEN SERVICE] GOOGLE_CLIENT_ID is missing. Gmail operations may fail.");
        }
        if (!this.clientSecret) {
            console.warn("⚠️ [TOKEN SERVICE] GOOGLE_CLIENT_SECRET is missing. Refreshing tokens will fail.");
        }
    }

    /**
     * Get valid access token for a user
     * Reads from Firestore, refreshes if expired.
     */
    async getValidToken(uid: string): Promise<string> {
        console.log(`🔍 [TOKEN] Searching tokens for UID: ${uid}`);
        const db = getDb();
        if (!db) {
            console.error("❌ [TOKEN] Firestore DB instance is NULL");
            throw new Error('DB_NOT_INITIALIZED');
        }

        let doc;
        try {
            doc = await db.collection('gmail_tokens').doc(uid).get();
        } catch (err: any) {
            console.error("❌ [TOKEN] Firestore read failed:", err.message);
            throw new Error(`DB_READ_ERROR: ${err.message}`);
        }

        if (!doc.exists) {
            console.warn(`⚠️ [TOKEN] No Gmail document found for UID: ${uid}`);
            throw new Error('GMAIL_NOT_CONNECTED');
        }

        const data = doc.data() as GmailToken;
        console.log(`✅ [TOKEN] Found token for ${data.email || 'unknown user'}. Connected: ${data.connected}`);

        // Check for expiration (buffer of 5 minutes)
        const now = Math.floor(Date.now() / 1000);
        if (data.expiresAt && data.expiresAt > now + 300) {
            console.log(`⚡ [TOKEN] Access token is still valid. (Expires in ${data.expiresAt - now}s)`);
            return data.accessToken;
        }

        console.log("♻️ [TOKEN] Access token expired. Attempting refresh...");
        if (!data.refreshToken) {
            console.error("❌ [TOKEN] Refresh token missing from Firestore!");
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
