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

async function generateContent(apiKey: string, model: string, prompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    console.log(`[AI] Fetching via REST: ${url.replace(apiKey, '***')}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: "You are Govind, a concise voice assistant. Optimize for TTS.\n\nUser: " + prompt }]
            }],
            generationConfig: {
                maxOutputTokens: 800
            }
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        // Log detailed error from Google
        console.error(`[AI] Google API Error (${response.status}) for ${model}: ${errorBody}`);
        throw new Error(`Google API Error (${response.status}): ${errorBody}`);
    }

    const data: any = await response.json();
    if (!data.candidates || !data.candidates[0].content || !data.candidates[0].content.parts) {
        console.error(`[AI] Unexpected JSON structure for ${model}:`, JSON.stringify(data));
        throw new Error("Invalid response structure from Gemini API");
    }

    const text = data.candidates[0].content.parts[0].text;
    return text || "";
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

        console.log(`[AI] Processing prompt via REST: ${prompt.substring(0, 30)}...`);

        // 4. API Key Resolution
        const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.apiKey;
        if (!apiKey) {
            console.error("AI Key Missing in Process Env");
            return res.status(500).json({
                error: 'Server AI Key Missing',
                details: 'Please enable the Production checkbox for GEMINI_API_KEY in Vercel Settings.'
            });
        }

        // 5. Multi-Model Fallback Loop
        const models = [
            "gemini-2.0-flash-exp",
            "gemini-1.5-flash",
            "gemini-1.5-flash-latest",
            "gemini-1.5-pro",
            "gemini-pro"
        ];
        let lastError;

        for (const model of models) {
            try {
                console.log(`[AI] Trying model: ${model}`);
                const text = await generateContent(apiKey, model, prompt);
                console.log(`[AI] Success with ${model}`);

                return res.status(200).json({
                    success: true,
                    data: { response: text, model: model }
                });
            } catch (err: any) {
                console.warn(`[AI] Fail with ${model}`);
                lastError = err;
            }
        }

        // If we get here, all models failed
        console.error("[AI CRASH] All models failed.", lastError);

        let errorMessage = lastError?.message || "Unknown AI Error";
        let clientMsg = "AI Service Unavailable";

        if (errorMessage.includes("404") || errorMessage.includes("not found")) {
            clientMsg = "AI Model not found (404). Please ENABLE 'Generative Language API' in your Google Cloud Console.";
        } else if (errorMessage.includes("403") || errorMessage.includes("permission")) {
            clientMsg = "AI Access Denied (403). Your API Key is valid but lacks permissions. Enable 'Generative Language API'.";
        } else if (errorMessage.includes("400") || errorMessage.includes("INVALID_ARGUMENT")) {
            clientMsg = "AI Request Invalid (400). The model may be incompatible with the region or prompt.";
        } else {
            clientMsg = `AI Error: ${errorMessage.substring(0, 100)}`;
        }

        return res.status(500).json({
            success: false,
            error: clientMsg,
            debug: errorMessage
        });

    } catch (error: any) {
        console.error("[AI CRASH] Top level:", error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal Server Error'
        });
    }
}
