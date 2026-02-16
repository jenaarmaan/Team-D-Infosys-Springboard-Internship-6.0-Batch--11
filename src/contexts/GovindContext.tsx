//src/contexts/GovindContext.tsx

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";

import { detectIntent, TargetPlatform } from "@/lib/govind/intentMap";
import { useGmail } from "@/contexts/GmailContext";
import { useTelegram } from "@/contexts/TelegramContext";
import { onAuthChange } from "@/lib/firebase/auth";
import { speakText, interruptTTS } from "@/services/ttsService";
import { useSettings } from "@/contexts/SettingsContext";
import type { GovindState } from "@/lib/govind/stateMachine";
import { handleGlobalCommand } from "@/lib/govind/commandRouter";
import { completeRegistration } from "@/services/registrationFlow";
import { messagingPlatformService } from "@/services/messagingPlatformService";
import { loginStep1BaseAuth, loginStep2Finalize } from "@/services/loginFlow";
import { User } from "firebase/auth";
import {
  canAcceptVoice,
} from "@/lib/govind/stateMachine";
import { useNavigate } from "react-router-dom";
import { resetVoiceController, pauseListening, stopListening } from "@/lib/govind/voiceStateController";
import {
  restoreSession,
  createSession,
  destroySession,
} from "@/lib/identity/sessionManager";
import { VoiceEvent } from "@/voice/voiceTypes";
import {
  handleRegisterSpeech,
  handleLoginSpeech,
  RegistrationSession,
} from "@/auth/authController";
import { generateEmailDraft } from "@/services/emailDrafter";
import { RegisterStep, LoginStep } from "@/auth/authTypes";
import { hashVoicePin } from "@/services/voicePinService";
import {
  createUserProfile,
  updateVoicePinHash,
  markFaceRegistered,
  getSecurityStateByEmail,
} from "@/lib/firebase/users";
import { getFaceImageUrl } from "@/lib/firebase/storage";
import { detectSensitiveData } from "@/privacy/detector";
import { sanitize } from "@/privacy/sanitizer";
import { routeToPlatform } from "@/lib/platforms/platformRouter";
import { getTelegramClient } from "@/lib/telegram/telegramClient";
import { callGeminiSecurely } from "@/lib/ai/gemini";
import { federatedPrivacy } from "@/privacy/federated";





/* ================= TYPES ================= */

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

type AuthMode = "LOGIN" | "REGISTER" | null;

type AuthStep =
  | "IDLE"
  | RegisterStep
  | LoginStep
  | "COMPLETE";

interface GovindContextType {

  setRegistrationEmail: (email: string) => void;
  setRegistrationPassword: (password: string) => void;
  setRegistrationVoicePinHash: (hash: string) => void;
  setRegistrationFaceImage: (file: File) => void;
  setLoginEmail: (email: string) => void;
  setLoginPassword: (password: string) => void;
  setLoginSpokenPin: (pin: string) => void;
  handleIntent: (text: string) => void;


  state: GovindState;
  messages: Message[];
  isAssistantOpen: boolean;
  setIsAssistantOpen: (v: boolean) => void;
  assistantEnabled: boolean;
  enableAssistant: () => Promise<void>;

  speak: (text: string) => void;
  addMessage: (role: Message["role"], content: string) => void;
  setState: React.Dispatch<React.SetStateAction<GovindState>>;
  wakeUp: () => void;

  authMode: AuthMode;
  authStep: AuthStep;
  setAuthStep: (s: AuthStep) => void;

  isAuthenticated: boolean;
  setIsAuthenticated: (v: boolean) => void;
  userName: string | null;
  setUserName: (n: string | null) => void;

  routeIntent: string | null;
  setRouteIntent: (s: string | null) => void;

  faceImageUrl: string | null;
  sleep: () => void;
  clearMessages: () => void;
}



const GovindContext = createContext<GovindContextType | undefined>(undefined);


export const useGovind = () => {
  const ctx = useContext(GovindContext);
  if (!ctx) throw new Error("GovindContext missing");
  return ctx;
};


/* ================= PROVIDER ================= */

export const GovindProvider = ({ children }: { children: ReactNode }) => {
  const settings = useSettings();
  const gmail = useGmail();
  const telegram = useTelegram();
  const navigate = useNavigate();
  const [state, setState] = useState<GovindState>("DORMANT");

  const [messages, setMessages] = useState<Message[]>([]);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const openAssistant = () => setIsAssistantOpen(true);
  const closeAssistant = () => setIsAssistantOpen(false);
  const [assistantEnabled, setAssistantEnabled] = useState(false);
  // 🔹 Voice routing mode (GLOBAL = default, GMAIL = Gmail commands)
  const [voiceMode, setVoiceMode] = useState<"GLOBAL" | "GMAIL" | "COMPOSE_FLOW">("GLOBAL");

  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [authStep, setAuthStep] = useState<AuthStep>("IDLE");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [routeIntent, setRouteIntent] =
    useState<string | null>(null);
  const [faceImageUrl, setFaceImageUrl] = useState<string | null>(null);

  // 📝 Compose State (Voice Flow)
  const [composeStep, setComposeStep] = useState<"IDLE" | "TO" | "CONFIRM_TO" | "PROMPT" | "CONFIRM_DRAFT" | "CONFIRM_SEND" | "EDITING" | "APPENDING">("IDLE");
  const [composePlatform, setComposePlatform] = useState<TargetPlatform>("gmail");
  const composeStepRef = useRef(composeStep);
  const composePlatformRef = useRef(composePlatform);
  const composeDataRef = useRef({ to: '', subject: '', body: '', chatId: undefined as number | undefined, privacyInfo: [] as string[] });
  const lastPlatformRef = useRef<TargetPlatform | null>(null);
  const activeChatIdRef = useRef<number | null>(null);
  const selectedEmailIdRef = useRef<string | null>(null);

  useEffect(() => {
    composeStepRef.current = composeStep;
  }, [composeStep]);



  const registrationDataRef = useRef<{
    email?: string;
    password?: string;
    voicePinHash?: string;
    faceImage?: File;
  }>({});
  const loginDataRef = useRef<{
    email?: string;
    password?: string;
    spokenPin?: string;
  }>({});
  const userRef = useRef<User | null>(null);
  const registrationConfirmRef = useRef<{
    password?: string;
    appPassword?: string;
  }>({});

  const setRegistrationEmail = (email: string) => {
    registrationDataRef.current.email = email;
  };

  const setRegistrationPassword = (password: string) => {
    registrationDataRef.current.password = password;
  };

  const setRegistrationVoicePinHash = (hash: string) => {
    registrationDataRef.current.voicePinHash = hash;
  };

  const setRegistrationFaceImage = (file: File) => {
    registrationDataRef.current.faceImage = file;
  };

  const setLoginEmail = (email: string) => {
    loginDataRef.current.email = email;
  };

  const setLoginPassword = (password: string) => {
    loginDataRef.current.password = password;
  };

  const setLoginSpokenPin = (pin: string) => {
    loginDataRef.current.spokenPin = pin;
  };


  const isAwakeRef = useRef(false);
  const authStepRef = useRef<AuthStep>("IDLE");
  const authModeRef = useRef<AuthMode>(null);
  const voiceModeRef = useRef(voiceMode);
  const stateRef = useRef<GovindState>("DORMANT");

  useEffect(() => {
    authStepRef.current = authStep;
    authModeRef.current = authMode;
    stateRef.current = state;
    voiceModeRef.current = voiceMode;
    composePlatformRef.current = composePlatform;
    activeChatIdRef.current = telegram.activeChatId;
    selectedEmailIdRef.current = gmail.selectedEmail?.id || null;
    composeDataRef.current = {
      ...gmail.composeData,
      chatId: (composeDataRef.current as any).chatId,
      privacyInfo: (composeDataRef.current as any).privacyInfo || []
    };
  }, [authStep, authMode, state, voiceMode, gmail.composeData, composePlatform, telegram.activeChatId, gmail.selectedEmail]);

  useEffect(() => {
    if (routeIntent) {
      console.log("[ROUTE] Navigating to", routeIntent);
      navigate(routeIntent);
    }
  }, [routeIntent]);
  // ✅ System Reset (Global State Recovery)
  const resetSystem = () => {
    console.log("[SYSTEM] Resetting all states");
    destroySession();
    if (!settings.continuousListening) {
      stopListening();
    } else {
      pauseListening("GLOBAL_EXIT");
    }
    setAuthMode(null);
    setAuthStep("IDLE");
    setVoiceMode("GLOBAL");
    setState("DORMANT");
    setIsAssistantOpen(false);
    isAwakeRef.current = false;
  };

  const sleep = () => resetSystem();
  const clearMessages = () => setMessages([]);


  // ======================================================
  // 🔐 STAGE-2: ROUTE VOICE-AUTH → REAL INTENT PIPELINE

  // ======================================================
  useEffect(() => {
    const authHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.source !== "voice-auth") return;

      const intent = detail.text;
      if (!intent) return;

      console.log("[IDENTITY] Routing voice-auth intent:", intent);

      // 🔒 Prevent duplicate REGISTER / LOGIN dispatch
      if (intent === "REGISTER" || intent === "LOGIN") {
        handleIntent(intent);
      }

    };

    window.addEventListener("govind:voice", authHandler);
    return () => window.removeEventListener("govind:voice", authHandler);
  }, []);

  /* ================= VOICE EVENT SUBSCRIPTION (SP2) ================= */
  useEffect(() => {
    const handleVoiceEvent = (e: any) => {
      const event = (e as CustomEvent).detail as VoiceEvent;
      if (!event) return;

      switch (event.type) {
        case "TRANSCRIPT":
          console.log("[RUNTIME → CHAT]", event.text);
          // 🔒 Ground Truth: user speech ALWAYS enters chat log
          addMessage("user", event.text);

          // 🔥 Stage-1: user speech always interrupts TTS
          interruptTTS();

          // 🔐 AUTH FLOWS MUST BYPASS STATE GATING
          if (authModeRef.current === "REGISTER" || authModeRef.current === "LOGIN") {
            handleIntent(event.text);
            return;
          }

          // 🔒 Non-auth commands gated by state machine
          if (canAcceptVoice(stateRef.current)) {
            handleIntent(event.text);
          }
          break;

        case "ERROR":
          console.error("[RUNTIME ERROR]", event.reason);
          addMessage("system", `Voice Error: ${event.reason}`);
          break;
      }
    };

    window.addEventListener("govind:voice_event", handleVoiceEvent);

    //  WAKE Word → UI OPEN (SP2)
    const onWake = () => {
      console.log("[STATE] Wake word detected — opening assistant");
      setIsAssistantOpen(true);
      setState("LISTENING");
      speak("I'm listening.");
    };

    // SLEEP Command (SP2)
    const onSleep = () => {
      console.log("[STATE] Sleep command detected");
      resetSystem();
    };

    window.addEventListener("govind:wake", onWake);
    window.addEventListener("govind:sleep", onSleep);

    return () => {
      window.removeEventListener("govind:voice_event", handleVoiceEvent);
      window.removeEventListener("govind:wake", onWake);
      window.removeEventListener("govind:sleep", onSleep);
    };
  }, []); // Dependencies for closure safety


  useEffect(() => {
    const onWakeStateRestore = () => {
      console.log("[STATE] Wake received — transitioning to AWAKE");
      setState("AWAKE");

      setTimeout(() => {
        setState("LISTENING");
      }, 0);
    };

    window.addEventListener("govind:wake", onWakeStateRestore);

    return () => {
      window.removeEventListener("govind:wake", onWakeStateRestore);
    };
  }, []);


  /* ================= FACE VERIFICATION EVENTS ================= */

  useEffect(() => {
    const onFaceEvent = (e: any) => {
      const { result } = e.detail || {};

      if (result === "FACE_OK") {
        console.log("[FACE] Identity confirmed");
        setAuthStep("VOICE_PIN");
        if (authModeRef.current === "REGISTER") {
          speak("Face captured. Now, please say your four digit voice PIN.");
        } else {
          speak("Identity verified via Face. Please say your voice PIN to log in.");
        }
        return;
      }


      if (result === "FACE_FAIL") {
        console.log("[FACE] Verification failed");
        setAuthStep("FACE");
        setState("WAITING_FOR_FACE");
        speak("Verification failed. Please try again or adjust your lighting.");
        return;
      }


    };

    window.addEventListener("govind:face", onFaceEvent);
    return () => window.removeEventListener("govind:face", onFaceEvent);
  }, []);

  /* ================= SESSION RESTORE (STAGE-2) ================= */

  useEffect(() => {
    const session = restoreSession();

    if (session?.isAuthenticated && session.user) {
      console.log("[SESSION] Restored identity session", session.user);

      setIsAuthenticated(true);
      setUserName(session.user.name || null);
      setState("AUTHENTICATED");
    }
  }, []);


  useEffect(() => {
    const unsub = onAuthChange((user) => {
      if (user) {
        console.log("[AUTH] Firebase user detected:", user.uid);
        // 🔒 Only auto-auth if NOT in the middle of a security flow
        if (!authModeRef.current) {
          setIsAuthenticated(true);
          setUserName(user.email?.split("@")[0] || null);
        }
      } else {
        setIsAuthenticated(false);
        setUserName(null);
      }
    });

    return () => unsub();
  }, []);


  /* ================= 🔓 AUTH MODE UNLOCK (FIX) ================= */
  useEffect(() => {
    if (authStep === "IDLE" && authMode === "REGISTER") {
      setAuthMode(null);

      // ✅ IMPORTANT: return to normal listening mode
      setState("LISTENING");
    }
  }, [authStep, authMode]);

  /* ================= REGISTRATION COMPLETE ================= */

  useEffect(() => {
    if (authMode === "REGISTER" && authStep === "COMPLETE") {
      (async () => {
        try {
          const { email, password, voicePin, faceImage } =
            registrationDataRef.current as RegistrationSession;

          if (!email || !password || !voicePin || !faceImage) {
            throw new Error("Incomplete registration data");
          }

          // 🔐 HASH PIN HERE (SP1 Requirement)
          const voicePinHash = await hashVoicePin(voicePin);

          const regResult = await completeRegistration({
            email,
            password,
            voicePinHash,
            faceImage,
          });

          if (regResult.status === "FAIL") {
            speak(`Registration failed: ${regResult.error}. Please try again or say register to restart.`);
            setAuthStep("EMAIL"); // Back to start or handle better?
            return;
          }

          createSession({
            userId: email,
            email,
            name: email.split("@")[0],
          });

          speak("Registration successful. Welcome to Govind! You are now logged in and verified.");

          setAuthMode(null);
          delete document.body.dataset.authMode;
          setAuthStep("IDLE");
          setIsAuthenticated(true);
          setUserName(email.split("@")[0]);
          navigate("/");
          setIsAssistantOpen(false);
          setState("LISTENING");




        } catch (err) {
          resetSystem();
        }
      })();
    }
  }, [authMode, authStep]);

  /* ================= LOGIN COMPLETE (VOICE PIN STEP) ================= */
  useEffect(() => {
    if (authMode === "LOGIN" && authStep === "COMPLETE") {
      (async () => {
        try {
          const { spokenPin } = loginDataRef.current;
          if (!spokenPin || !userRef.current) throw new Error("Incomplete login data");

          console.log("[AUTH] Final Phase: Verifying Voice PIN");
          const result = await loginStep2Finalize(userRef.current, spokenPin);

          if (result.status === "OK") {
            setIsAuthenticated(true);
            setUserName(result.user.email?.split("@")[0] || null);
            createSession({
              userId: result.user.uid,
              email: result.user.email || undefined,
              name: result.user.email?.split("@")[0],
            });

            setAuthMode(null);
            setAuthStep("IDLE");
            setState("AUTHENTICATED");
            navigate("/");
            setIsAssistantOpen(false);
            setState("LISTENING");
            speak("Access granted. Welcome back.");
          } else if (result.status === "BAD_PIN") {
            speak("Incorrect voice PIN. Please try again.");
            setAuthStep("VOICE_PIN");
          } else {
            speak("Login failed. Please check your credentials.");
            resetSystem();
          }
        } catch (err) {
          console.error("[LOGIN] Final phase failed:", err);
          speak("Critical error during verification.");
        }
      })();
    }
  }, [authMode, authStep]);

  /* ---------------- INTERMEDIATE LOGIN STEPS ---------------- */
  useEffect(() => {
    if (authMode === "LOGIN" && authStep === "FACE") {
      (async () => {
        const { email, password } = loginDataRef.current;
        if (!email || !password) return;

        console.log("[AUTH] Initiating Step 1: Base Auth & Biometric Kickoff");
        const result = await loginStep1BaseAuth(email, password);

        if (result.status === "BIOMETRIC_REQUIRED") {
          userRef.current = result.user;
          (window as any).govind_uid = result.user.uid; // 🔥 Link UID for local face match
          setState("WAITING_FOR_LIVENESS");
          speak("I need to verify your presence. Please look at the camera for 3D depth analysis.");
        } else if (result.status === "NO_FACE") {
          speak("Your face is not registered. Please complete registration first.");
          resetSystem();
        } else {
          speak("Login failed. Please check your credentials.");
          setAuthStep("EMAIL");
        }
      })();
    }
  }, [authMode, authStep]);

  /* ------------------ UTIL ------------------ */

  const addMessage = (role: Message["role"], content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role, content, timestamp: new Date() },
    ]);
  };

  /* ------------------ ENABLE ASSISTANT ------------------ */
  const enableAssistant = async () => {
    if (assistantEnabled) return;

    setAssistantEnabled(true);
    setState("LISTENING");

    speak("Govind voice assistant is now enabled.");
  };



  /* ------------------ SPEAKING UTILITY ------------------ */
  const speak = (text: string, options?: { cancelPrevious?: boolean, volume?: number, rate?: number }) => {
    // 🔇 Respect Voice Feedback Toggle
    if (!settings.voiceFeedback) {
      console.log(`[GOVIND FEEDBACK (SILENT)]: ${text}`);
      addMessage("assistant", text);
      return;
    }

    console.log(`[GOVIND SPEAKING]: ${text}`);
    addMessage("assistant", text);
    speakText(text, {
      ...options,
      volume: settings.speechVolume / 100,
      rate: settings.speechRate / 50
    });
  };

  /* ------------------ WAKE UP ------------------ */

  const wakeUp = () => {
    isAwakeRef.current = true;
    setState("AWAKE");
    setIsAssistantOpen(true);
  };

  const handleRegistrationStep = (text: string) => {
    handleRegisterSpeech(
      text,
      registrationDataRef.current as RegistrationSession,
      (updater) => {
        if (typeof updater === 'function') {
          registrationDataRef.current = updater(registrationDataRef.current as RegistrationSession);
        } else {
          registrationDataRef.current = updater;
        }
      },
      authStepRef.current as RegisterStep,
      (s: RegisterStep) => setAuthStep(s as AuthStep),
      speak
    );
  };



  const handleLoginStep = (text: string) => {
    handleLoginSpeech(
      text,
      authStepRef.current as LoginStep,
      (s: LoginStep) => {
        if (s === "SUCCESS") {
          setAuthStep("COMPLETE" as AuthStep);
        } else {
          setAuthStep(s as AuthStep);
        }
      },
      speak,
      loginDataRef
    );
  };




  /* ------------------ AI ENGINE ------------------ */
  const generateTelegramSummary = async (messages: any[], chatTitle: string) => {
    if (messages.length === 0) return "No messages to summarize.";

    // Format simple history for AI
    const historyText = messages
      .slice(0, 20) // Get last 20 for context
      .reverse()    // Put in chronological order
      .map(m => `${m.senderName}: ${m.text}`)
      .join("\n");

    const prompt = `
      You are an AI assistant helping a user summarize their Telegram messages.
      The following is a conversation history with "${chatTitle}":
      
      ${historyText}
      
      Task: Provide a concise, 1-2 sentence summary of this specific conversation. 
      Focus on the main topic, any pending actions, or the general vibe of the last few exchanges.
      Do NOT hallucinate information about meetings or external events not mentioned in the text.
      If it's just greetings like "hello", "whats up", say it's just a casual check-in.
    `;

    try {
      const { response: aiSummary, privacy } = await callGeminiSecurely(prompt);

      if (privacy.entities.length > 0) {
        console.log(`[PRIVACY] Telegram summary generated with ${privacy.entities.length} masked entities.`);
      }

      return aiSummary;
    } catch (e) {
      console.error("Failed to generate AI summary:", e);
      return "Thread of recent messages.";
    }
  };


  /* ------------------ INTENT HANDLER ------------------ */

  const handleIntent = async (text: string) => {
    console.log("[INTENT] processing:", text, "Auth:", authModeRef.current, "Voice:", voiceModeRef.current, "Step:", composeStepRef.current);

    // 📧 GMAIL COMPOSE FLOW (Interceptive & AI-Powered)
    if (voiceModeRef.current === "COMPOSE_FLOW") {
      const lower = text.toLowerCase();

      // Global exit/cancel in the middle of a flow
      if (lower.includes("cancel") || lower.includes("stop") || lower.includes("exit") || lower.includes("discard")) {
        speak("Cancelled and discarded the draft.");
        gmail.setIsComposeOpen(false);
        setVoiceMode("GLOBAL");
        setComposeStep("IDLE");
        return;
      }

      // --- STEP 1: CAPTURE RECIPIENT ---
      if (composeStepRef.current === "TO") {
        if (composePlatformRef.current === "telegram") {
          const recipient = text.trim();
          const newData = { ...composeDataRef.current, to: recipient };
          composeDataRef.current = newData;
          setComposeStep("CONFIRM_TO");
          speak(`You want to message ${recipient} on Telegram. Is that correct?`);
        } else {
          let recipient = text.toLowerCase().replace(/\s/g, "");
          recipient = recipient.replace(/at/g, "@").replace(/dot/g, ".");
          const newData = { ...composeDataRef.current, to: recipient };
          composeDataRef.current = newData;
          gmail.setComposeData(newData);
          setComposeStep("CONFIRM_TO");
          speak(`You want to email ${recipient}. Is that correct?`);
        }
        return;
      }

      // --- STEP 2: CONFIRM RECIPIENT ---
      if (composeStepRef.current === "CONFIRM_TO") {
        if (lower.includes("yes") || lower.includes("correct") || lower.includes("yeah") || lower.includes("right")) {
          setComposeStep("PROMPT");
          const targetText = composePlatformRef.current === "telegram" ? "message" : "email";
          speak(`Confirmed. What would you like to say in this ${targetText}?`);
        } else {
          setComposeStep("TO");
          const targetText = composePlatformRef.current === "telegram" ? "telegram contact" : "email address";
          speak(`Sorry about that. Who should I send this ${targetText} to?`);
        }
        return;
      }

      // --- NEW STEP: EDITING CONTENT (Direct Quote) ---
      if (composeStepRef.current === "EDITING") {
        const newData = {
          ...composeDataRef.current,
          body: text,
          // We don't clear privacyInfo because the subject or parts of previous draft (not replaced) might still be relevant,
          // but for the body itself, since it's a "quote", we just use raw text.
        };
        composeDataRef.current = newData;
        if (composePlatformRef.current === "telegram") {
          telegram.updateDraft(text);
        } else {
          gmail.setComposeData(newData);
        }

        setComposeStep("CONFIRM_DRAFT");
        speak(`Updated your message to say: "${text}". Shall I send it now, or do you want to hear it back?`);
        return;
      }

      // --- NEW STEP: APPENDING CONTENT (Direct Quote) ---
      if (composeStepRef.current === "APPENDING") {
        const currentBody = composeDataRef.current.body;
        const newBody = currentBody ? `${currentBody} ${text}` : text;

        const newData = {
          ...composeDataRef.current,
          body: newBody,
        };
        composeDataRef.current = newData;
        if (composePlatformRef.current === "telegram") {
          telegram.updateDraft(newBody);
        } else {
          gmail.setComposeData(newData);
        }

        setComposeStep("CONFIRM_DRAFT");
        speak(`Added that to your message. The full message now says: "${newBody}". Shall I send it now, read it back, or add more?`);
        return;
      }

      // --- STEP 3: CAPTURE CONTENT & AI DRAFT ---
      if (composeStepRef.current === "PROMPT") {
        if (composePlatformRef.current === "telegram") {
          let processingText = text;
          let privacyInfo: string[] = [];

          if (settings.privacyMasking) {
            const spans = detectSensitiveData(text);
            const sanitized = sanitize(text, spans);
            processingText = sanitized.sanitizedText;
            privacyInfo = sanitized.entities.map(e => e.type);
          }

          const newData = { ...composeDataRef.current, body: processingText, privacyInfo } as any;
          composeDataRef.current = newData;
          telegram.updateDraft(processingText);

          if (privacyInfo.length > 0) {
            privacyInfo.forEach(type => federatedPrivacy.recordFeedback({ entityType: type, originalValue: "DIRECT_PROMPT", isCorrect: true }));
          }

          setComposeStep("CONFIRM_DRAFT");
          let privacyMsg = "";
          if (privacyInfo.length > 0) {
            const types = [...new Set(privacyInfo)].join(" and ");
            privacyMsg = ` (I've masked your ${types} for security.)`;
          }
          speak(`Ready to send to ${composeDataRef.current.to} saying: "${processingText}".${privacyMsg} Shall I send it, read it back, edit, add more, or discard?`);
        } else {
          speak("Drafting your email with AI...");
          try {
            const draftResult = await generateEmailDraft(text, composeDataRef.current.subject);
            const newData = {
              ...composeDataRef.current,
              subject: draftResult.subject,
              body: draftResult.body,
              privacyInfo: draftResult.privacyInfo || []
            };
            composeDataRef.current = newData;
            gmail.setComposeData(newData);

            setComposeStep("CONFIRM_DRAFT");

            let privacyDisclaimer = "";
            if (newData.privacyInfo.length > 0) {
              const types = [...new Set(newData.privacyInfo)].join(" and ");
              privacyDisclaimer = ` I've also masked your ${types} for security.`;
            }

            speak("The email is ready." + privacyDisclaimer + " Shall I read it out, send it, edit, add something, or discard it?");
          } catch (err: any) {
            console.error("AI Drafting failed", err);
            const errorMsg = err.message?.includes("not found") ? "The AI model is currently unavailable." : "I had trouble drafting that.";
            speak(`${errorMsg} Let's try again. What would you like to say?`, { cancelPrevious: true });
          }
        }
        return;
      }

      // --- STEP 4: PRE-SEND REVIEW ---
      if (composeStepRef.current === "CONFIRM_DRAFT") {
        const wantsToRead = lower.includes("read") || lower.includes("hear") || (lower.includes("yes") && !lower.includes("send"));
        const wantsToSend = lower.includes("send") || lower.includes("do it") || (lower.includes("yes") && lower.includes("send"));

        if (wantsToRead) {
          const { subject, body } = composeDataRef.current;
          if (composePlatformRef.current === "telegram") {
            speak(`The message says: "${body}". Shall I send it now?`);
          } else {
            speak(`The subject is "${subject}". The message says: "${body}". Shall I send it now?`);
          }
          setComposeStep("CONFIRM_SEND");
          return;
        }

        if (wantsToSend) {
          const platformLabel = composePlatformRef.current === "telegram" ? "Telegram message" : "email";
          speak(`Sending ${platformLabel} now.`);
          try {
            const { to, subject, body } = composeDataRef.current;

            if (composePlatformRef.current === "telegram") {
              const client = getTelegramClient();
              const targetChatId = (composeDataRef.current as any).chatId || telegram.activeChatId || client.getDefaultChatId() || -1;
              await client.sendMessage(targetChatId, body);
              telegram.updateDraft(null);
            } else {
              await gmail.sendNewEmail(to, subject, body);
              gmail.setIsComposeOpen(false);
            }

            setVoiceMode("GLOBAL");
            setComposeStep("IDLE");
            speak(`${platformLabel === "Telegram message" ? "Telegram message" : "Email"} sent successfully.`);
          } catch (err: any) {
            console.error("Manual send failed", err);
            speak(`I'm sorry, I couldn't send the ${platformLabel}. There was an error.`, { cancelPrevious: true });
          }
          return;
        }

        if (lower.includes("change") || lower.includes("restart") || lower.includes("no")) {
          speak("Starting over. Who is the recipient?");
          setComposeStep("TO");
          const resetData = { to: "", subject: "", body: "", chatId: undefined, privacyInfo: [] as string[] };
          composeDataRef.current = resetData;
          gmail.setComposeData(resetData);
          return;
        }

        if (lower.includes("edit") || lower.includes("modify") || lower.includes("rewrite")) {
          setComposeStep("EDITING");
          speak("Sure, please say the new message content exactly as you want it.");
          return;
        }

        if (lower.includes("add") || lower.includes("append") || lower.includes("more")) {
          setComposeStep("APPENDING");
          speak("Sure, what would you like to add to the message?");
          return;
        }

        speak("Say 'Read' to hear the draft, 'Send' to confirm, 'Edit' to replace, 'Add' to append more, or 'Discard' to cancel.");
        return;
      }

      // --- STEP 5: FINAL CONFIRMATION ---
      if (composeStepRef.current === "CONFIRM_SEND") {
        if (lower.includes("yes") || lower.includes("send") || lower.includes("yeah") || lower.includes("do it") || (lower.includes("yes") && lower.includes("send"))) {
          const platformLabel = composePlatformRef.current === "telegram" ? "Telegram message" : "email";
          speak(`Sending ${platformLabel} now.`);
          try {
            const { to, body, chatId } = composeDataRef.current;

            if (composePlatformRef.current === "telegram") {
              const client = getTelegramClient();
              const targetChatId = chatId || telegram.activeChatId || client.getDefaultChatId() || -1;
              await client.sendMessage(targetChatId, body);
              telegram.updateDraft(null);
            } else {
              const { subject } = composeDataRef.current;
              await gmail.sendNewEmail(to, subject, body);
              gmail.setIsComposeOpen(false);
            }

            setVoiceMode("GLOBAL");
            setComposeStep("IDLE");
            speak(`${platformLabel === "Telegram message" ? "Telegram message" : "Email"} sent successfully.`);
          } catch (err: any) {
            console.error("Final send failed", err);
            speak(`I couldn't send it. It might be a connection issue.`, { cancelPrevious: true });
          }
          return;
        }

        if (lower.includes("no") || lower.includes("stop") || lower.includes("cancel")) {
          speak("Okay, I won't send it. What should I change? Recipient, or the message?");
          setComposeStep("CONFIRM_DRAFT");
          return;
        }

        speak("Shall I send it now? Say yes or no.");
        return;
      }
    }

    // 🔴 0. GLOBAL COMMAND PREEMPTION (Safety First)
    if (
      handleGlobalCommand(
        text,
        resetSystem,
        stateRef.current,
        setVoiceMode
      )
    ) {
      return;
    }

    // 🔒 1. HARD AUTH LOCK (Mid-flow session)
    if (authModeRef.current === "REGISTER") {
      handleRegistrationStep(text);
      return;
    }

    if (authModeRef.current === "LOGIN") {
      handleLoginStep(text);
      return;
    }


    // 🧠 3. INTENT DETECTION (SP3)
    // 🔍 4. Intent Detection
    const intent = detectIntent(text);
    console.log("[INTENT] Resolved:", intent.action, "@", intent.platform, intent.entities);

    // 🔐 4. Auth & System Intents
    if (intent.action === "LOGOUT") {
      speak("Logging you out.", { cancelPrevious: true });
      resetSystem();
      return;
    }

    if (intent.action === "LOGIN") {
      setAuthMode("LOGIN");
      setAuthStep("EMAIL");
      setState("AUTH_LOGIN");
      setRouteIntent("/login");
      speak("Alright. Let’s log you in. Please say your email.", { cancelPrevious: true });
      return;
    }

    if (intent.action === "REGISTER") {
      setAuthMode("REGISTER");
      setAuthStep("EMAIL");
      setState("AUTH_REGISTER");
      setRouteIntent("/register");
      speak("Alright. Let’s get you registered. Please say your email.", { cancelPrevious: true });
      return;
    }

    // 🚀 5. Platform Execution (SP4)
    // 🚀 5. Platform Execution (SP4)
    if (intent.platform !== "system") {
      // 🧠 Contextual Re-routing: Prioritize the platform the user is currently viewing or recently used
      const path = window.location.pathname;
      const currentPagePlatform = path.startsWith("/telegram") ? "telegram" :
        path.startsWith("/gmail") ? "gmail" : null;

      // Use current page or last used as fallback for ambigious intents
      const activePlatform = currentPagePlatform || lastPlatformRef.current;

      const commonActions = ["READ", "SEND", "SUMMARIZE", "CLOSE_CHAT", "DRAFT", "REPLY"];
      if (activePlatform && intent.platform !== activePlatform && commonActions.includes(intent.action)) {
        console.log(`[CONTEXT] Contextual re-routing from ${intent.platform} to active ${activePlatform}:`, intent.action);
        intent.platform = activePlatform as any;
      }

      // Specialized handling for OPEN_PLATFORM if UI action is needed
      // Specialized handling for OPEN_PLATFORM if UI action is needed
      if (intent.action === "OPEN_PLATFORM" && intent.platform === "gmail") {
        speak("Opening Gmail.");
        setRouteIntent("/gmail");
        return;
      }


      if (intent.action === "VIEW_FOLDER" && intent.platform === "gmail") {
        const folder = intent.entities.query || "inbox";
        speak(`Opening your ${folder} section.`);
        gmail.changeSection(folder);
        // Ensure we are on the gmail page
        setRouteIntent("/gmail");
        return;
      }

      (async () => {
        // 🧠 Inject Context (e.g. Current Email ID for Reply/Summarize)
        if (intent.platform === "gmail" && selectedEmailIdRef.current) {
          intent.entities.messageId = selectedEmailIdRef.current;
        }
        if (intent.platform === "telegram" && activeChatIdRef.current) {
          intent.entities.chatId = activeChatIdRef.current.toString();
        }

        // Pass complete intent with text
        if (intent.action === "CLOSE_CHAT" && intent.platform === "telegram" && !activeChatIdRef.current) {
          speak("First, you need to open a chat before I can close it.");
          return;
        }

        const result = await messagingPlatformService.handleIntent(intent);
        if (result.success) {
          lastPlatformRef.current = intent.platform;
        }
        speak(result.message);

        // 🟢 HANDLE UI COMPONENT TRIGGERS
        if (result.data?.type === "OPEN_COMPOSE") {
          gmail.setComposeData({ to: "", subject: "", body: "" }); // Reset
          setComposePlatform(intent.platform);
          gmail.setIsComposeOpen(intent.platform === "gmail");
          setVoiceMode("COMPOSE_FLOW");
          setComposeStep("TO");
        }

        if (result.data?.type === "OPEN_COMPOSE_REPLY") {
          const { to, subject, body, chatId, privacyInfo } = result.data;
          composeDataRef.current = { to, subject: subject || "Reply via Telegram", body: body || "", chatId, privacyInfo: privacyInfo || [] };
          gmail.setComposeData({ to, subject: subject || "Reply via Telegram", body: body || "" });
          setComposePlatform(intent.platform);
          gmail.setIsComposeOpen(intent.platform === "gmail");

          if (intent.platform === "telegram") {
            telegram.updateDraft(body || "");
            if (chatId) telegram.selectChat(chatId);
            setRouteIntent("/telegram");
          }

          setVoiceMode("COMPOSE_FLOW");

          if (!to) {
            // Need recipient name
            setComposeStep("TO");
          } else if (body) {
            // "Quick Reply" or "AI Suggestion" - Skip prompt, go to confirmation
            setComposeStep("CONFIRM_DRAFT");
            const platformLabel = intent.platform === "telegram" ? "Telegram message" : "reply";
            speak(`I've prepared your ${platformLabel} to ${to} saying: "${body}". Shall I send it now, or would you like to edit, add more, or discard it?`);
          } else {
            // Needs user input msg - Adapter already spoke the prompt
            setComposeStep("PROMPT");
          }
        }

        if (result.data?.type === "NAVIGATE_CHAT" && intent.platform === "telegram") {
          telegram.selectChat(result.data.chatId);
          setRouteIntent(result.data.path || "/telegram");
        }

        if (result.data?.type === "NAVIGATE_CHATS" && intent.platform === "telegram") {
          telegram.selectChat(null);
          setRouteIntent("/telegram");
        }

        if (result.data?.type === "CHATS_LIST" && intent.platform === "telegram") {
          telegram.updateUnreadChats(result.data.chats);
          telegram.selectChat(null);
          setRouteIntent("/telegram");
        }

        if (result.data?.type === "CLOSE_CHAT_UI" && intent.platform === "telegram") {
          telegram.closeChat();
        }

        // 🟢 SYNC READ EMAIL TO UI
        if (result.success && intent.action === "READ") {
          if (intent.platform === "gmail" && result.data?.id) {
            gmail.openEmail(result.data.id);
          } else if (intent.platform === "telegram" && result.data?.messages) {
            if (result.data.chatId) {
              telegram.selectChat(result.data.chatId);
            }
            telegram.updateMessages(result.data.messages);
            setRouteIntent("/telegram");
          }
        }

        // 🟢 SYNC SUMMARY TO UI
        if (result.success && intent.action === "SUMMARIZE" && intent.platform === "telegram") {
          const chatId = (result.data?.chatId || activeChatIdRef.current) as number;
          // Use freshly fetched messages from Adapter if available, otherwise fallback to history
          let chatMsgs = (result.data?.messages as any[]) || telegram.history[chatId] || [];

          if (chatMsgs.length === 0) {
            speak("I couldn't find any messages to update you on.");
            return;
          }

          // Limit to recent 10 as requested (5-10)
          if (chatMsgs.length > 10) chatMsgs = chatMsgs.slice(0, 10);

          const chatTitle = telegram.unreadChats.find(c => c.id === chatId)?.title || "this chat";

          // Avoid double-speak if adapter already spoke "Analyzing..."
          if (!result.message.includes("Analyzing")) {
            speak("Sure, let me analyze those messages for you.");
          }

          const aiSummary = await generateTelegramSummary(chatMsgs, chatTitle);
          telegram.updateSummary(aiSummary);
          console.log("[SUMMARY DEBUG] AI Summary generated. Length:", aiSummary.length);

          // Small safety delay to ensure previous "Analyzing" speech is done or settling
          setTimeout(() => {
            console.log("[SUMMARY DEBUG] Triggering speech for summary...");
            const privacyDisclaimer = result.data?.privacyInfo?.length > 0
              ? " (Note: Some sensitive details were masked for your privacy.)"
              : "";
            speak(aiSummary + privacyDisclaimer, { cancelPrevious: true });
          }, 800);
          setRouteIntent("/telegram");
        }
      })();
      return;
    }


    if (intent.action === "UNKNOWN") {
      if (authModeRef.current) return; // Should be handled by auth handlers
      // 🧠 7. Generic Fallback (Improved)
      const isTelegramPage = window.location.pathname === "/telegram";
      const fallbackMsg = isTelegramPage
        ? "I'm sorry, I didn't quite catch that telegram command. You can say 'read my messages' or 'open chat with someone'."
        : "I heard you. You can say register, login, or open Gmail.";

      speak(fallbackMsg);
    }

  };




  /* ------------------ PROVIDER ------------------ */

  return (
    <GovindContext.Provider
      value={{
        handleIntent,

        setRegistrationEmail,
        setRegistrationPassword,
        setRegistrationVoicePinHash,
        setRegistrationFaceImage,

        setLoginEmail,
        setLoginPassword,
        setLoginSpokenPin,

        state,
        messages,
        isAssistantOpen,
        setIsAssistantOpen,
        assistantEnabled,
        enableAssistant,

        speak,
        addMessage,
        setState,
        wakeUp,

        authMode,
        authStep,
        setAuthStep,

        isAuthenticated,
        setIsAuthenticated,
        userName,
        setUserName,

        routeIntent,
        setRouteIntent,

        faceImageUrl,
        sleep,
        clearMessages,
      }}
    >

      {children}
    </GovindContext.Provider>
  );
};
