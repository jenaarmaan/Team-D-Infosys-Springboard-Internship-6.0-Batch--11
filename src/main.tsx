import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

console.log("FRONTEND ENV CHECK:", {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    telegramToken: import.meta.env.VITE_TELEGRAM_BOT_TOKEN
});

createRoot(document.getElementById("root")!).render(<App />);
