import { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import admin from 'firebase-admin';

// Initialize Firebase Admin (Self-Contained)
if (!admin.apps.length) {
    const saKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const pId = process.env.VITE_FIREBASE_PROJECT_ID || 'voicemail-f11f3';

    if (saKey) {
        try {
            let cred = saKey.trim();
            if (cred.startsWith('"') && cred.endsWith('"')) cred = cred.slice(1, -1);
            cred = cred.replace(/\\n/g, '\n');
            admin.initializeApp({ credential: admin.credential.cert(JSON.parse(cred)) });
        } catch (e) {
            console.error("FB Admin Init Error:", e);
            admin.initializeApp({ projectId: pId });
        }
    } else {
        admin.initializeApp({ projectId: pId });
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 2. Auth Check
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const token = authHeader.split('Bearer ')[1];
        await admin.auth().verifyIdToken(token);

        // 3. Parse Body
        let { prompt } = req.body || {};
        if (typeof req.body === 'string') {
            try { prompt = JSON.parse(req.body).prompt; } catch { }
        }

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt required' });
        }

        console.log(`[AI] Processing prompt: ${prompt.substring(0, 30)}...`);

        // 4. Call Gemini (Directly)
        const keys = Object.keys(process.env).filter(k => k.includes('GEMINI'));
        console.log(`[AI DIAGNOSTIC] Seen Keys: ${keys.join(', ')}`);

        const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
            console.error("AI Key Missing in Process Env");
            return res.status(500).json({
                error: 'Server AI Key Missing',
                details: 'Please enable the Production checkbox for GEMINI_API_KEY in Vercel Settings.'
            });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: { maxOutputTokens: 800 }
        });

        const systemPrompt = "You are Govind, a concise voice assistant. Optimize for TTS.\n\nUser: " + prompt;
        const result = await model.generateContent(systemPrompt);
        const responseText = result.response.text();

        return res.status(200).json({
            success: true,
            data: { response: responseText }
        });

    } catch (error: any) {
        console.error("[AI CRASH]", error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal AI Error'
        });
    }
}
