//src/contexts/GmailContext.tsx

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRef } from "react";
import { connectGmail as oauthConnectGmail } from "@/lib/google/googleOAuth";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { auth } from "@/lib/firebase/firebase";

import { fetchInbox, readEmail, markEmailAsRead } from "@/lib/google/gmailReader";
import { sendEmail, replyToEmail } from "@/lib/google/gmailSender";
import { summarizeEmail, humanizeEmail } from "@/services/gmailSummarizer";
import { generateReplyDraft } from "@/services/gmailReplyGenerator";
import { getValidAccessToken } from "@/lib/google/gmailClient";
import { useSettings } from "@/contexts/SettingsContext";
import { speakText } from "@/services/ttsService";
import { apiClient } from "@/api/client";
import { useNavigate } from "react-router-dom";
import { getUserProfile } from "@/lib/firebase/users";

interface GmailContextType {
  handleGmailVoiceCommand: (transcript: string) => Promise<void>;

  inboxEmails: any[];
  selectedEmail: any;
  loading: boolean;
  error: string | null;

  replyDraft: string | null;

  openEmail: (id: string) => Promise<void>;
  closeEmail: () => void;
  summarizeCurrentEmail: () => Promise<void>;
  generateReply: (
    tone: "polite" | "short" | "professional"
  ) => Promise<void>;
  sendNewEmail: (to: string, subject: string, body: string) => Promise<void>;
  sendReply: () => Promise<void>;

  clearError: () => void;
  updateReplyDraft: (text: string) => void;

  startOAuth: () => void;
  handleOAuthCallback: () => void;
  fetchInboxViaOAuth: () => Promise<void>;
  oauthConnected: boolean;

  disconnect: () => Promise<void>;

  isComposeOpen: boolean;
  setIsComposeOpen: (v: boolean) => void;
  composeData: { to: string; subject: string; body: string; privacyInfo?: string[] };
  setComposeData: (d: any) => void;

  currentSection: string;
  changeSection: (section: string) => Promise<void>;
}

const GmailContext = createContext<GmailContextType | undefined>(undefined);

export const GmailProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const [gmailConnected, setGmailConnected] = useState(false);
  const [inboxEmails, setInboxEmails] = useState<any[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<any>(null);
  const [replyDraft, setReplyDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthConnected, setOauthConnected] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeData, setComposeData] = useState<{ to: string, subject: string, body: string, privacyInfo?: string[] }>({ to: '', subject: '', body: '', privacyInfo: [] });
  const [currentSection, setCurrentSection] = useState("inbox");

  const closeEmail = () => setSelectedEmail(null);

  useEffect(() => {
    const checkSession = async () => {
      const user = auth.currentUser;
      if (!user) {
        setGmailConnected(false);
        return;
      }
      const snap = await getDoc(doc(db, "gmail_tokens", user.uid));
      setGmailConnected(snap.exists() && snap.data()?.connected === true);
    };
    checkSession();
  }, []);

  const startOAuth = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error("[GMAIL][OAUTH] Missing client ID");
      return;
    }
    const redirectUri = `${window.location.origin}/gmail-oauth`;
    const scope =
      "https://www.googleapis.com/auth/gmail.readonly " +
      "https://www.googleapis.com/auth/gmail.send";

    const url =
      "https://accounts.google.com/o/oauth2/v2/auth" +
      `?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=token` +
      `&scope=${encodeURIComponent(scope)}` +
      `&prompt=consent`;

    console.log("[GMAIL][OAUTH] Redirecting to Google");
    window.location.href = url;
  };

  const handleOAuthCallback = async () => {
    const hash = window.location.hash;
    if (!hash.includes("access_token")) return;

    const params = new URLSearchParams(hash.substring(1));
    const token = params.get("access_token");
    if (!token) return;

    localStorage.setItem("gmail_oauth_token", token);
    setOauthConnected(true);

    try {
      const user = auth.currentUser;
      if (user) {
        const expiresAt = Date.now() + 100 * 24 * 60 * 60 * 1000;
        await setDoc(doc(db, "gmail_tokens", user.uid), {
          accessToken: token,
          expiresAt,
          connected: true,
          updatedAt: serverTimestamp(),
          email: user.email
        }, { merge: true });
        console.log("[GMAIL] OAuth token synced to Firestore");
      }
    } catch (err) {
      console.error("[GMAIL] Failed to sync token to Firestore", err);
    }

    setGmailConnected(true);
    window.history.replaceState({}, "", "/gmail");

    setTimeout(() => {
      fetchInboxViaOAuth();
    }, 1000);
  };

  const disconnect = async () => {
    const user = auth.currentUser;
    if (user) {
      await deleteDoc(doc(db, "gmail_tokens", user.uid));
    }
    setGmailConnected(false);
    setInboxEmails([]);
    setSelectedEmail(null);
    setReplyDraft(null);
  };

  const fetchInboxViaOAuth = async () => {
    setInboxEmails([]);
    setLoading(true);
    let token = "";

    try {
      // Step 1: Attempt OAuth Fetch
      token = await getValidAccessToken();
      localStorage.setItem("gmail_oauth_token", token);

      const query = currentSection === "starred" ? "is:starred" : currentSection === "sent" ? "in:sent" : "in:inbox";
      const result = await apiClient.get<any>(`/api/v1/gmail?action=list&limit=30&query=${encodeURIComponent(query)}`, { googleToken: token });

      if (result.success) {
        const messages = result.data?.messages || [];
        setInboxEmails(messages.map((email: any) => ({
          ...email,
          date: new Date(email.date)
        })));
        setLoading(false);
        sessionStorage.removeItem("gmail_oauth_redirected");
        return;
      }
      throw new Error(result.error?.message || "OAUTH_FETCH_FAILED");

    } catch (e: any) {
      console.warn("[GMAIL] OAuth fetching failed. Checking redirect status...", e);

      const alreadyRedirected = sessionStorage.getItem("gmail_oauth_redirected");

      if (!alreadyRedirected) {
        console.log("[GMAIL] First failure, triggering OAuth redirect...");
        sessionStorage.setItem("gmail_oauth_redirected", "true");
        startOAuth();
        return;
      }

      // Step 3: OAuth still failing. Attempt App Password fallback.
      console.log("[GMAIL] OAuth still failing. Attempting App Password fallback...");
      const query = currentSection === "starred" ? "is:starred" : currentSection === "sent" ? "in:sent" : "in:inbox";
      const fallbackResult = await apiClient.get<any>(`/api/v1/gmail?action=list&limit=30&query=${encodeURIComponent(query)}`);

      if (fallbackResult.success) {
        const messages = fallbackResult.data?.messages || [];
        setInboxEmails(messages.map((email: any) => ({
          ...email,
          date: new Date(email.date)
        })));
        setLoading(false);
        sessionStorage.removeItem("gmail_oauth_redirected");
        speakText("I'm using your Google App Password to fetch emails since OAuth is unavailable.");
        return;
      }

      // Step 4: Full Failure.
      console.error("[GMAIL] Fatal authentication failure. Redirecting to Profile.");
      setError("GMAIL_AUTH_CRITICAL");
      setLoading(false);

      const user = auth.currentUser;
      if (user) {
        const profile = await getUserProfile(user.uid);
        if (!profile?.security?.gmailAppPassword) {
          speakText("I'm having trouble connecting to your Gmail. Please add a Google App Password in your settings.");
        } else {
          speakText("Your Google App Password seems incorrect. Please update it in your profile settings.");
        }
      }

      navigate("/settings");
      return;
    }
  };

  useEffect(() => {
    handleOAuthCallback();
  }, []);

  const openEmail = async (id: string) => {
    try {
      setLoading(true);
      // Try OAuth token first
      let token = "";
      try {
        token = await getValidAccessToken();
      } catch (e) { }

      const result = await apiClient.get<any>(`/api/v1/gmail?action=get&id=${id}`, token ? { googleToken: token } : {});

      if (result.success && result.data?.messages?.[0]) {
        const email = result.data.messages[0];
        setReplyDraft(null);

        // 🔥 HUMANIZATION LAYER (Converts raw embeddings/junk to human narrative)
        try {
          const humanData = await humanizeEmail(email.body, email.subject, email.from, email.images);
          setSelectedEmail({
            ...email,
            body: humanData.content
          });
        } catch (hErr) {
          console.warn("[GMAIL CONTEXT] Humanization failed, showing raw content.");
          setSelectedEmail(email);
        }
      } else {
        throw new Error(result.error?.message || "Failed to read email");
      }
    } catch (err: any) {
      setError(err.message || "Failed to read email");
    } finally {
      setLoading(false);
    }
  };

  const summarizeCurrentEmail = async () => {
    if (!selectedEmail?.body) return;
    try {
      setLoading(true);
      const summary = await summarizeEmail(selectedEmail.body);
      setSelectedEmail({ ...selectedEmail, summary });
    } catch (err: any) {
      setError(err.message || "Failed to summarize email");
    } finally {
      setLoading(false);
    }
  };

  const generateReply = async (tone: "polite" | "short" | "professional") => {
    if (!selectedEmail) return;
    try {
      setLoading(true);
      const reply = await generateReplyDraft({
        emailBody: selectedEmail.body,
        sender: selectedEmail.from,
        tone,
      });
      setReplyDraft(reply.draft);
      setComposeData((prev: any) => ({
        ...prev,
        body: reply.draft,
        privacyInfo: reply.privacyInfo
      }));
    } catch (err: any) {
      setError(err.message || "Failed to generate reply");
    } finally {
      setLoading(false);
    }
  };

  const sendReply = async () => {
    if (!selectedEmail || !replyDraft) return;
    try {
      setLoading(true);
      let token = "";
      try {
        token = await getValidAccessToken();
      } catch (e) { }

      const result = await apiClient.post<any>("/api/v1/gmail", {
        action: 'send', // Using send for simplicity or backend reply if implemented
        to: selectedEmail.from,
        subject: `Re: ${selectedEmail.subject}`,
        body: replyDraft,
        threadId: selectedEmail.threadId
      }, token ? { googleToken: token } : {});

      if (result.success) {
        setReplyDraft(null);
        speakText("Reply sent successfully.");
      } else {
        throw new Error(result.error?.message || "Failed to send reply");
      }
    } catch (err: any) {
      setError(err.message || "Failed to send reply");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const sendNewEmail = async (to: string, subject: string, body: string) => {
    try {
      setLoading(true);
      let token = "";
      try {
        token = await getValidAccessToken();
      } catch (e) { }

      const result = await apiClient.post<any>("/api/v1/gmail", {
        action: 'send',
        to,
        subject,
        body
      }, token ? { googleToken: token } : {});

      if (result.success) {
        speakText("Email sent successfully.");
      } else {
        throw new Error(result.error?.message || "Failed to send email");
      }
    } catch (err: any) {
      setError(err.message || "Failed to send email");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleGmailVoiceCommand = async (transcript: string) => {
    const text = transcript.toLowerCase();
    try {
      if (text.includes("read") || text.includes("open")) {
        const wordMap: Record<string, number> = {
          "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "last": 1,
          "tenth": 10, "twentieth": 20, "thirtieth": 30, "fortieth": 40, "fiftieth": 50
        };
        const digitMatch = text.match(/\d+/);
        let index = digitMatch ? parseInt(digitMatch[0]) - 1 : -1;

        if (index === -1) {
          const wordEntries = Object.keys(wordMap).sort((a, b) => b.length - a.length).join("|");
          const wordMatch = text.match(new RegExp(`\\b(${wordEntries})\\b`, "i"));
          if (wordMatch) index = wordMap[wordMatch[1].toLowerCase()] - 1;
        }

        if (index >= 0 && inboxEmails[index]) {
          await openEmail(inboxEmails[index].id);
          return;
        }
      }
      if (text.includes("summarize")) { await summarizeCurrentEmail(); return; }
      if (text.includes("reply")) { await generateReply("polite"); return; }
      if (text.includes("send")) { await sendReply(); return; }
      if (text.includes("compose")) { setIsComposeOpen(true); return; }
    } catch (err: any) {
      setError(err.message || "Gmail voice command failed");
    }
  };

  useEffect(() => {
    if (oauthConnected) fetchInboxViaOAuth();
  }, [currentSection, oauthConnected]);

  const changeSection = async (section: string) => {
    setCurrentSection(section);
  };

  const clearError = () => setError(null);
  const updateReplyDraft = (text: string) => setReplyDraft(text);

  return (
    <GmailContext.Provider
      value={{
        startOAuth,
        handleOAuthCallback,
        fetchInboxViaOAuth,
        oauthConnected,
        handleGmailVoiceCommand,
        inboxEmails,
        selectedEmail,
        openEmail,
        closeEmail,
        replyDraft,
        loading,
        error,
        summarizeCurrentEmail,
        generateReply,
        sendReply,
        sendNewEmail,
        clearError,
        updateReplyDraft,
        disconnect,
        isComposeOpen,
        setIsComposeOpen,
        composeData,
        setComposeData,
        currentSection,
        changeSection
      }}
    >
      {children}
    </GmailContext.Provider>
  );
};

export const useGmail = () => {
  const context = useContext(GmailContext);
  if (!context) throw new Error("useGmail must be used within GmailProvider");
  return context;
};
