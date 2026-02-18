import { VercelRequest, VercelResponse } from '@vercel/node';
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

async function generateContent(apiKey: string, model: string, version: string, prompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`;

    console.log(`[AI] Fetching via REST (${version}): ${model}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: "You are Govind, a concise voice assistant. Optimize for TTS.\n\nUser: " + prompt }] }],
            generationConfig: { maxOutputTokens: 800 }
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Google API Error (${response.status}) [${version}/${model}]: ${errorBody}`);
    }

    const data: any = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error("Invalid response structure");
    return text;
}

// Helper to list actually available models for this key
async function listAvailableModels(apiKey: string): Promise<string[]> {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await fetch(url);
        if (!response.ok) return [`Error fetching models: ${response.status} ${response.statusText}`];
        const data: any = await response.json();
        return data.models ? data.models.map((m: any) => m.name.replace('models/', '')) : ["No models returned"];
    } catch (e: any) {
        return [`List check failed: ${e.message}`];
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        // 2. Auth Check
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const token = authHeader.split('Bearer ')[1];
        await admin.auth().verifyIdToken(token);

        // 3. Parse Body
        const { prompt } = req.body || {};
        const safePrompt = typeof req.body === 'string' ? JSON.parse(req.body).prompt : prompt;

        if (!safePrompt) return res.status(400).json({ error: 'Prompt required' });

        console.log(`[AI] Processing prompt via REST: ${safePrompt.substring(0, 30)}...`);

        // 4. API Key Resolution
        const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.apiKey;
        if (!apiKey) {
            console.error("AI Key Missing in Process Env");
            return res.status(500).json({ error: 'Server AI Key Missing' });
        }

        // 5. Matrix Strategy: Try ALL permutations of Model + API Version
        const modelMatrix = [
            { id: "gemini-1.5-flash", version: "v1beta" },
            { id: "gemini-1.5-flash-latest", version: "v1beta" },
            { id: "gemini-1.5-pro", version: "v1beta" },
            { id: "gemini-pro", version: "v1beta" },  // Standard beta
            { id: "gemini-pro", version: "v1" },      // STABLE V1 (Critical Fallback)
            { id: "gemini-1.0-pro", version: "v1" }    // Specific V1
        ];

        let lastError;

        for (const config of modelMatrix) {
            try {
                console.log(`[AI] Trying model: ${config.id} (${config.version})`);
                const text = await generateContent(apiKey, config.id, config.version, safePrompt);
                console.log(`[AI] Success with ${config.id} (${config.version})`);

                return res.status(200).json({
                    success: true,
                    data: { response: text, model: `${config.id} (${config.version})` }
                });
            } catch (err: any) {
                console.warn(`[AI] Failed ${config.id} (${config.version})`);
                lastError = err;
            }
        }

        // --- DIAGNOSTIC PHASE ---
        console.error("[AI CRASH] All models failed. Running diagnostics...");
        const availableModels = await listAvailableModels(apiKey);
        console.error(`[AI DIAGNOSTIC] Key has access to: ${JSON.stringify(availableModels)}`);

        return res.status(500).json({
            success: false,
            error: "AI Services Unavailable via Backend.",
            debug: {
                lastError: lastError?.message,
                availableModels: availableModels,
                keyHint: apiKey ? `${apiKey.substring(0, 5)}...` : 'NONE'
            }
        });

    } catch (error: any) {
        console.error("[AI CRASH] Top level:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
