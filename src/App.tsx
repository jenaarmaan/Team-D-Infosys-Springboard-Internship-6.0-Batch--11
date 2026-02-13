import React, { useEffect } from 'react';
import { apiClient } from './api/client';

function App() {
    useEffect(() => {
        // Health check logic used as internal verification
        apiClient.get('/health')
            .then(data => console.log('[PROD BOOT] API Health:', data))
            .catch(err => console.error('[PROD BOOT] API Unreachable:', err));
    }, []);

    return (
        <div className="min-h-screen bg-[#0a0c10] text-white flex flex-col items-center justify-center p-4">
            <header className="text-center space-y-4">
                <h1 className="text-5xl font-extrabold tracking-tighter bg-gradient-to-r from-cyan-400 to-teal-500 bg-clip-text text-transparent">
                    GOVIND
                </h1>
                <p className="text-zinc-500 font-medium max-w-md">
                    Enterprise-Hardened Secure Voice Assistant
                </p>
            </header>

            <main className="mt-12 w-full max-w-lg bg-[#11141b] border border-zinc-800 rounded-2xl p-8 shadow-2xl">
                <div className="flex items-center gap-4 text-zinc-400">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-sm font-semibold tracking-wider uppercase">Production Active</span>
                </div>

                <div className="mt-8 space-y-6">
                    <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
                        <h2 className="text-xs font-bold text-zinc-500 uppercase">Architecture</h2>
                        <p className="mt-1 text-sm font-medium">Serverless API v1 + Google Gemini AI</p>
                    </div>

                    <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
                        <h2 className="text-xs font-bold text-zinc-500 uppercase">Security</h2>
                        <p className="mt-1 text-sm font-medium">RBAC-Ready Auth & Idempotent Webhooks</p>
                    </div>
                </div>
            </main>

            <footer className="mt-auto py-8 text-zinc-600 text-xs font-medium">
                Team D - Infosys Springboard - Batch 11
            </footer>
        </div>
    );
}

export default App;
