import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const isProd = import.meta.env.PROD;
const rawKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const geminiStatus = rawKey
    ? `EXISTS (${rawKey.substring(0, 10)}...${rawKey.substring(rawKey.length - 4)})`
    : "MISSING (CHECK VERCEL PROD ENV)";

console.log(`🌐 [${isProd ? 'PRODUCTION' : 'DEVELOPMENT'}] FRONTEND ENV CHECK (v1.0.19):`, {
    firebase: import.meta.env.VITE_FIREBASE_API_KEY ? "READY" : "MISSING",
    gemini: geminiStatus,
    google: import.meta.env.VITE_GOOGLE_CLIENT_ID ? "READY" : "MISSING"
});

createRoot(document.getElementById("root")!).render(<App />);
