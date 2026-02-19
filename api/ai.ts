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
        let errorHint = "";
        try {
            const errJson = await response.json();
            errorHint = JSON.stringify(errJson);
        } catch {
            errorHint = await response.text();
        }
        throw new Error(`Google API Error (${response.status}) for ${model}: ${errorHint.substring(0, 150)}`);
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

        const keyPrefix = apiKey.substring(0, 10);
        const keySuffix = apiKey.substring(apiKey.length - 4);
        console.log(`[AI] (v1.0.19) Using key: ${keyPrefix}...${keySuffix} (Length: ${apiKey.length})`);

        // 5. Dynamic Model Discovery
        // Ideally, we check what models this key actually has access to
        let discoveredModels: any[] = [];
        try {
            console.log("[AI] Discovering available models for key...");
            const modelListRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            const modelJson = await modelListRes.json();

            if (modelJson.models) {
                const availableNames = modelJson.models.map((m: any) => m.name.replace("models/", ""));
                console.log(`[AI] Discovered ${availableNames.length} models: ${availableNames.slice(0, 5).join(", ")}...`);

                // Prioritize finding a "flash" or "pro" model that actually exists
                const bestModel = availableNames.find((n: string) => n.includes("gemini-1.5-flash")) ||
                    availableNames.find((n: string) => n.includes("gemini-1.5-pro")) ||
                    availableNames.find((n: string) => n.includes("gemini"));

                if (bestModel) {
                    console.log(`[AI] Prioritizing discovered model: ${bestModel}`);
                    discoveredModels.push({ id: bestModel, version: "v1beta" });
                }
            }
        } catch (e) {
            console.warn("[AI] Model discovery failed, using hardcoded matrix only.", e);
        }

        // 6. Matrix Strategy: Discovered + Hardcoded
        const modelMatrix = [
            ...discoveredModels,
            { id: "gemini-1.5-flash", version: "v1beta" },
            { id: "gemini-1.5-flash", version: "v1" },
            { id: "gemini-1.5-flash-latest", version: "v1beta" },
            { id: "gemini-1.5-flash-001", version: "v1beta" },
            { id: "gemini-1.5-flash-002", version: "v1beta" },
            { id: "gemini-1.5-pro", version: "v1beta" },
            { id: "gemini-1.0-pro", version: "v1beta" },
            { id: "gemini-pro", version: "v1beta" }
        ];

        let lastError;
        const failedAttempts: any[] = [];
        let successResponse = null;

        for (const config of modelMatrix) {
            try {
                console.log(`[AI] Trying model: ${config.id} (${config.version})`);
                const text = await generateContent(apiKey, config.id, config.version, safePrompt);
                console.log(`[AI] Success with ${config.id} (${config.version})`);

                successResponse = {
                    response: text,
                    model: `${config.id} (${config.version})`,
                    keyUsed: keyPrefix
                };
                break; // Exit loop on success
            } catch (err: any) {
                console.warn(`[AI] Failed ${config.id} (${config.version}): ${err.message}`);
                failedAttempts.push({
                    model: config.id,
                    version: config.version,
                    error: err.message,
                    is404: err.message.includes("404")
                });
                lastError = err;
            }
        }

        if (successResponse) {
            return res.status(200).json({ success: true, data: successResponse });
        }

        // --- ULTRA DIAGNOSTIC PHASE ---
        console.error("[AI CRASH] All models failed. Running deep diagnostics...");

        // Re-fetch only if needed (though we fetched above, we do it safely here for the error report)
        const modelListRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        let modelListData: any = { error: "Fetch failed" };
        try { modelListData = await modelListRes.json(); } catch { }

        const isServiceEnabled = modelListRes.status !== 404;
        const availableModelNames = modelListData.models?.map((m: any) => m.name.replace("models/", "")) || [];

        // Identify Key Source
        let keySource = "UNKNOWN";
        if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.startsWith(keyPrefix)) keySource = "GEMINI_API_KEY";
        else if (process.env.VITE_GEMINI_API_KEY && process.env.VITE_GEMINI_API_KEY.startsWith(keyPrefix)) keySource = "VITE_GEMINI_API_KEY";

        return res.status(500).json({
            success: false,
            error: "AI Services Configuration Issue.",
            debug: {
                lastError: lastError?.message,
                failedAttempts,
                serviceStatus: isServiceEnabled ? "Enabled" : "404_NOT_FOUND",
                modelCount: modelListData.models?.length || 0,
                // FORCE STRINGIFY to ensure it shows in client logs
                availableModelsSample: JSON.stringify(availableModelNames.slice(0, 15)),
                keySource: keySource,
                keyHint: `${keyPrefix}...${keySuffix}`,
                version: "v1.0.19",
                troubleshooting: {
                    type: "NO_WORKING_MODELS",
                    recommendation: "Check 'availableModelsSample' in debug. If it's empty, user has no access. If it has models, we failed to call them (quota?)."
                }
            }
        });

    } catch (error: any) {
        console.error("[AI CRASH] Top level:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
