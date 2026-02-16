// src/App.tsx

import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { GovindProvider, useGovind } from "@/contexts/GovindContext";
import { GmailProvider } from "@/contexts/GmailContext";
import { TelegramProvider } from "@/contexts/TelegramContext";
import { SettingsProvider, useSettings } from "@/contexts/SettingsContext";
import { auth } from "@/lib/firebase/firebase";
import {
  initVoiceRecognition,
  startListening,
  stopListening,
  setVoiceReinitCallback,
} from "@/lib/govind/voiceStateController";
import { initPlatforms } from "@/lib/platforms/init";
import { bindVoiceLifecycle } from "@/lib/govind/voiceLifecycle";
import { messagingPlatformService } from "@/services/messagingPlatformService";
// Initialize all platform adapters (Gmail, Telegram, WhatsApp)
initPlatforms();

// Initialize messaging platforms from environment
messagingPlatformService.initialize().then((status) => {
  console.log('[APP] Platform initialization complete:', status);
  if (status.telegram) console.log('[APP] ✅ Telegram ready');
}).catch((err) => {
  console.error('[APP] Platform initialization error:', err);
});

// Pages
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Gmail from "./pages/Gmail";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Docs from "./pages/Docs";
import { Outlook, WhatsApp } from "./pages/Platforms";
import Telegram from "./pages/Telegram";
import NotFound from "./pages/NotFound";
import GmailOAuth from "./pages/GmailOAuth";

/* ======================================================
   🔍 FIREBASE AUTH DEBUG (SAFE)
   ====================================================== */

auth.onAuthStateChanged((user) => {
  console.log("[FIREBASE AUTH]", user ? user.email : "NOT LOGGED IN");
});

const queryClient = new QueryClient();

/* ======================================================
   🎙️ VOICE BOOTSTRAP (SINGLE ENTRY POINT)
   ====================================================== */

const VoiceBootstrap = () => {
  const { state, assistantEnabled } = useGovind();
  const { continuousListening, wakeWordSensitivity } = useSettings();

  const recognitionRef = useRef<any>(null);
  const stateRef = useRef(state);

  // Keep latest state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const init = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error("[VOICE] SpeechRecognition not supported");
      return;
    }

    console.log("[VOICE] Creating fresh SpeechRecognition instance...");
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognitionRef.current = recognition;

    // Init mic controller
    initVoiceRecognition(recognition);

    // Bind voice → Govind pipeline
    bindVoiceLifecycle(
      recognition,
      () => stateRef.current,
      (text: string) => {
        console.log("[VOICE] Lifecycle transcript:", text);
      },
      () => {
        console.log("[VOICE] Reset requested");
      },
      () => wakeWordSensitivity
    );
  };

  useEffect(() => {
    init();
    setVoiceReinitCallback(init);
    console.log("[VOICE] Ready — waiting for user gesture");
  }, []);

  // 🔄 React to Continuous Listening Setting
  useEffect(() => {
    if (assistantEnabled) {
      if (continuousListening) {
        console.log("[VOICE] Continuous listening enabled — starting mic");
        startListening();
      } else {
        console.log("[VOICE] Continuous listening disabled — stopping mic");
        stopListening();
      }
    }
  }, [continuousListening, assistantEnabled]);

  return null;
};

/* ======================================================
   🚀 APP ROOT
   ====================================================== */
const RouteDebugger = () => {
  const location = useLocation();

  useEffect(() => {
    console.log("[ROUTE DEBUG] Current path:", location.pathname);
  }, [location.pathname]);

  return null;
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <TooltipProvider>
          <BrowserRouter>

            {/* 🔐 Gmail must wrap Govind */}
            <TelegramProvider>
              <GmailProvider>
                <GovindProvider>
                  {/* 🎙️ VOICE SYSTEM (GLOBAL, ONCE) */}
                  <VoiceBootstrap />
                  {/* 🌐 ROUTER */}
                  <Routes>
                    {/* Public */}
                    <Route path="/" element={<Index />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />

                    {/* Core */}
                    <Route path="/dashboard" element={<Dashboard />} />

                    {/* Platforms */}
                    <Route path="/gmail-oauth" element={<GmailOAuth />} />
                    <Route path="/gmail" element={<Gmail />} />
                    <Route path="/outlook" element={<Outlook />} />
                    <Route path="/telegram" element={<Telegram />} />
                    <Route path="/whatsapp" element={<WhatsApp />} />

                    {/* User */}
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/docs" element={<Docs />} />

                    {/* Fallback */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                  {/* 🔔 GLOBAL UI */}
                  <Toaster />
                  <Sonner />
                </GovindProvider>
              </GmailProvider>
            </TelegramProvider>

          </BrowserRouter>
        </TooltipProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
};


export default App;
