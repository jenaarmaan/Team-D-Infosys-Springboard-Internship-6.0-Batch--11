import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

console.log("FRONTEND ENV CHECK:", {
    firebaseKey: import.meta.env.VITE_FIREBASE_API_KEY ? "EXISTS" : "MISSING",
    geminiKey: import.meta.env.VITE_GEMINI_API_KEY ? "EXISTS" : "MISSING",
    googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID
});

createRoot(document.getElementById("root")!).render(<App />);
