import { getDb } from '../lib/clients/firebase.admin';
import { logger } from '../lib/logger';
import * as admin from 'firebase-admin';

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
        if (!process.env.GOOGLE_CLIENT_ID && !process.env.VITE_GOOGLE_CLIENT_ID) {
            console.warn("⚠️ [TOKEN SERVICE] GOOGLE_CLIENT_ID is missing. Gmail operations may fail.");
        }
        if (!process.env.GOOGLE_CLIENT_SECRET && !process.env.VITE_GOOGLE_CLIENT_SECRET) {
            console.warn("⚠️ [TOKEN SERVICE] GOOGLE_CLIENT_SECRET is missing. Refreshing tokens will fail.");
        }
    }

    /**
     * Get valid access token for a user
     * Reads from Firestore, refreshes if expired.
     */
    async getValidToken(uid: string): Promise<string> {
        console.log(`🔍 [TOKEN] Searching tokens for UID: ${uid}`);
        const db = await getDb();
        if (!db) {
            console.error("❌ [TOKEN] Firestore DB instance is NULL");
            throw new Error('DB_NOT_INITIALIZED');
        }

        let doc: admin.firestore.DocumentSnapshot;
        try {
            // 🛑 5s Timeout for Firestore (avoid Lambda hang)
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('FIRESTORE_TIMEOUT')), 5000));
            const getPromise = db.collection('gmail_tokens').doc(uid).get();
            doc = await Promise.race([getPromise, timeoutPromise]) as admin.firestore.DocumentSnapshot;
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

            const params = new URLSearchParams();
            params.append('client_id', this.clientId as string);
            params.append('client_secret', this.clientSecret as string);
            params.append('refresh_token', refreshToken);
            params.append('grant_type', 'refresh_token');

            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Google API Error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            const { access_token, expires_in } = data;
            const expiresAt = Math.floor(Date.now() / 1000) + expires_in;

            // Update Firestore with new token
            const db = await getDb();
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
