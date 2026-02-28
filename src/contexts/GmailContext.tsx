//src/contexts/GmailContext.tsx

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRef } from "react";
import { connectGmail as oauthConnectGmail } from "@/lib/google/googleOAuth";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { auth } from "@/lib/firebase/firebase";

// EXISTING IMPORTS (UNCHANGED)
import { fetchInbox, readEmail, markEmailAsRead } from "@/lib/google/gmailReader";
import { sendEmail, replyToEmail } from "@/lib/google/gmailSender";
import { summarizeEmail } from "@/services/gmailSummarizer";
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

  // 🔓 OAuth-only
  startOAuth: () => void;
  handleOAuthCallback: () => void;
  fetchInboxViaOAuth: () => Promise<void>;
  oauthConnected: boolean;

  disconnect: () => Promise<void>;

  // ✉️ Compose control
  isComposeOpen: boolean;
  setIsComposeOpen: (v: boolean) => void;
  composeData: { to: string; subject: string; body: string; privacyInfo?: string[] };
  setComposeData: (d: any) => void;

  currentSection: string;
  changeSection: (section: string) => Promise<void>;
}




const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GmailContext = createContext<GmailContextType | undefined>(undefined);

export const GmailProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const [gmailConnected, setGmailConnected] = useState(false);
  const [inboxEmails, setInboxEmails] = useState<any[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<any>(null);
  const [replyDraft, setReplyDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 🔐 OAuth-only session (VOICE → OPEN GMAIL)
  const oauthTokenRef = useRef<string | null>(null);
  const [oauthConnected, setOauthConnected] = useState(false);
  const settings = useSettings();
  const [processedEmailIds] = useState(new Set<string>());

  const closeEmail = () => setSelectedEmail(null);

  // ✉️ COMPOSE MODAL STATE
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeData, setComposeData] = useState<{ to: string, subject: string, body: string, privacyInfo?: string[] }>({ to: '', subject: '', body: '', privacyInfo: [] });
  const [currentSection, setCurrentSection] = useState("inbox");



  // 🔒 AUTHORITATIVE SESSION CHECK (ON LOAD)
  useEffect(() => {
    const checkSession = async () => {
      const user = auth.currentUser;
      if (!user) {
        setGmailConnected(false);
        return;
      }

      console.log("Firestore path UID:", user.uid);
      console.log("Firestore path EMAIL:", user.email);
      const snap = await getDoc(doc(db, "gmail_tokens", user.uid));
      setGmailConnected(snap.exists() && snap.data()?.connected === true);
    };

    checkSession();
  }, []);

  const fetchInboxEmails = async () => {
    if (oauthConnected) {
      console.warn("[GMAIL] Skipping Firebase inbox fetch — OAuth active");
      return;
    }

    try {
      setLoading(true);
      const emails = await fetchInbox(5); // Reduced from 50 for Vercel stability
      setInboxEmails(emails);
    } catch (err: any) {
      setError(err.message || "Failed to fetch inbox");
    } finally {
      setLoading(false);
    }
  };
  // 📬 OAUTH-ONLY INBOX FETCH (VOICE FLOW)
  // const fetchInboxViaOAuth = async () => {
  //   if (!oauthTokenRef.current) return;

  //   const res = await fetch(
  //     "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10",
  //     {
  //       headers: {
  //         Authorization: `Bearer ${oauthTokenRef.current}`,
  //       },
  //     }
  //   );

  //   const data = await res.json();
  //   console.log("[GMAIL][OAUTH] Inbox fetched", data);
  // };


  const connectGmail = async () => {
    await oauthConnectGmail();
    setGmailConnected(true);
    await fetchInboxEmails();
  };

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


  // 🟢 VOICE ENTRY: START GOOGLE OAUTH (NO FIREBASE REQUIRED)
  // const startOAuth = () => {
  //   const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  //   const redirectUri = window.location.origin + "/gmail-oauth";

  //   const scope =
  //     "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send";

  //   const url =
  //     "https://accounts.google.com/o/oauth2/v2/auth" +
  //     `?client_id=${clientId}` +
  //     `&redirect_uri=${encodeURIComponent(redirectUri)}` +
  //     `&response_type=token` +
  //     `&scope=${encodeURIComponent(scope)}` +
  //     `&prompt=consent`;

  //   window.location.href = url;
  // };

  const handleOAuthCallback = async () => {
    const hash = window.location.hash;
    if (!hash.includes("access_token")) return;

    const params = new URLSearchParams(hash.substring(1));
    const token = params.get("access_token");
    const expiresIn = params.get("expires_in");

    if (!token) return;

    localStorage.setItem("gmail_oauth_token", token);
    setOauthConnected(true);

    // 🔐 SYNC TO FIRESTORE (Bridge to GmailClient)
    try {
      const user = auth.currentUser;
      if (user) {
        // ⚠️ DEMO HACK: Force long expiry (100 days) to avoid frequent re-login
        // Google tokens actually expire in 1h, but GAPI often allows grace periods or we just want to suppress the prompt
        const expiresAt = Date.now() + 100 * 24 * 60 * 60 * 1000;

        console.log("Firestore path UID:", user.uid);
        console.log("Firestore path EMAIL:", user.email);
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

    // Auto-fetch after connect
    setTimeout(() => {
      fetchInboxViaOAuth();
    }, 1000);
  };




  const disconnect = async () => {
    const user = auth.currentUser;
    if (user) {
      console.log("Firestore path UID:", user.uid);
      console.log("Firestore path EMAIL:", user.email);
      await deleteDoc(doc(db, "gmail_tokens", user.uid));
    }

    setGmailConnected(false);
    setInboxEmails([]);
    setSelectedEmail(null);
    setReplyDraft(null);
  };

  const refreshInbox = async () => {
    await fetchInboxEmails();
  };
  // 🔁 HANDLE GOOGLE OAUTH REDIRECT
  // const handleOAuthCallback = () => {
  //   const hash = new URLSearchParams(window.location.hash.slice(1));
  //   const token = hash.get("access_token");

  //   if (!token) return;

  //   oauthTokenRef.current = token;
  //   setOauthConnected(true);

  //   // Clean URL
  //   window.history.replaceState({}, "", "/gmail");
  // };

  /* ================= OAUTH FETCH HELPERS ================= */

  const getEmailDetails = async (id: string, token: string) => {
    const result = await apiClient.get<any>(`/api/v1/gmail?action=get&id=${id}`, { googleToken: token });
    if (!result.success) throw new Error(result.error?.message || "Failed to fetch email details");
    return result.data;
  };

  const fetchInboxViaOAuth = async () => {
    // 1. Clear existing list to show loading state for new section
    setInboxEmails([]);
    setLoading(true);
    let token = "";

    try {
      token = await getValidAccessToken();
      localStorage.setItem("gmail_oauth_token", token);
    } catch (e: any) {
      console.warn("[GMAIL] OAuth failed. Checking for App Password fallback...");

      const user = auth.currentUser;
      if (user) {
        const profile = await getUserProfile(user.uid);
        const hasAppPassword = profile?.security?.gmailAppPassword;

        if (!hasAppPassword) {
          console.warn("[GMAIL] No OAuth token and no App Password found. Prompting user.");
          setError("GMAIL_AUTH_CRITICAL");
          setLoading(false);

          navigate("/settings");
          speakText("I'm having trouble connecting to your Gmail. Please add a Google App Password in your settings, or say it to me now.");
          return;
        }
      }

      setError("AUTH_ERROR");
      setLoading(false);
      // 🚀 AUTO-TRIGGER OAUTH ON FAILURE AS BACKUP
      startOAuth();
      return;
    }

    // 2. Map section to query
    let query = "in:inbox";
    if (currentSection === "starred") query = "is:starred";
    else if (currentSection === "sent") query = "in:sent";
    else if (currentSection === "drafts") query = "in:draft";
    else if (currentSection === "trash") query = "in:trash";
    else if (currentSection === "spam") query = "in:spam";
    else if (currentSection === "inbox") {
      // Only show unread in "Inbox" if requested, otherwise show all
      // For now, let's keep it consistent with the UI "Unread Inbox"
      query = "in:inbox is:unread";
    }

    try {
      // 3. Fetch via Secure Proxy
      console.log(`[GMAIL] Fetching section: ${currentSection} (Query: ${query})`);
      const result = await apiClient.get<any>(
        `/api/v1/gmail?action=list&limit=50&unread=${currentSection === 'inbox' && !query.includes('is:unread')}&query=${encodeURIComponent(query)}`,
        { googleToken: token }
      );

      if (result.success) {
        const messages = (result as any)?.data?.messages ?? (result as any)?.messages ?? [];
        setInboxEmails((Array.isArray(messages) ? messages : []).map((email: any) => ({
          ...email,
          date: new Date(email.date)
        })));
        setLoading(false);
        return;
      }
      console.warn("[GMAIL] Backend fetch failed, falling back to frontend direct fetch.");
    } catch (err: any) {
      console.error("[GMAIL] Backend fetch crashed, falling back to frontend direct fetch.", err);
    }

    // Fallback: Direct Fetch
    try {
      console.log("[GMAIL] Attempting direct frontend fetch for section:", currentSection);
      const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${encodeURIComponent(query)}`;
      const response = await fetch(listUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error(`Direct Fetch failed: ${response.status}`);

      const data = await response.json();
      const messages = (data.messages || []).slice(0, 10); // Limit to top 10 for fallback
      const emails = [];

      for (const msg of messages) {
        try {
          const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!detailRes.ok) continue;

          const detail = await detailRes.json();
          const headers = detail.payload?.headers || [];
          const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || '';

          emails.push({
            id: msg.id,
            threadId: detail.threadId,
            from: getHeader('From'),
            subject: getHeader('Subject'),
            date: new Date(getHeader('Date')),
            snippet: detail.snippet,
            isUnread: detail.labelIds?.includes('UNREAD')
          });

          // Minimal throttle to avoid 429
          await new Promise(r => setTimeout(r, 100));
        } catch (e) { console.warn("[GMAIL] Metadata fetch failed", e); }
      }
      setInboxEmails(emails.filter(Boolean));
    } catch (fallbackErr) {
      console.error("[GMAIL] Fallback fetch failed:", fallbackErr);
      setError("Failed to fetch Gmail inbox");
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    handleOAuthCallback();
  }, []);


  const openEmail = async (id: string) => {
    try {
      setLoading(true);
      const email = await readEmail(id);
      await markEmailAsRead(id);
      setSelectedEmail(email);
      setReplyDraft(null);
    } catch (err: any) {
      setError(err.message || "Failed to read email");
    } finally {
      setLoading(false);
    }
  };

  /**
  * 🎙️ VOICE → GMAIL COMMAND ROUTER (DEMO CORE)
  */
  const handleGmailVoiceCommand = async (transcript: string) => {
    const text = transcript.toLowerCase();

    try {
      // 📬 READ / OPEN EMAIL
      if (text.includes("read") || text.includes("open")) {
        // ... legacy code ...
        // We can leave this as fallback or update it.
        // Since the main logic is in Adapter, we can ignore this unless used.
        // But for consistency let's support words.

        const wordMap: Record<string, number> = {
          "first": 1, "1st": 1, "one": 1,
          "second": 2, "2nd": 2, "two": 2,
          "third": 3, "3rd": 3, "three": 3,
          "fourth": 4, "4th": 4, "four": 4,
          "fifth": 5, "5th": 5, "five": 5,
          "sixth": 6, "6th": 6, "six": 6,
          "seventh": 7, "7th": 7, "seven": 7,
          "eighth": 8, "8th": 8, "eight": 8,
          "ninth": 9, "9th": 9, "nine": 9,
          "tenth": 10, "10th": 10, "ten": 10
        };

        const digitMatch = text.match(/(?:read|open).*(?:number|email)?\s*(\d+)/i);
        const wordMatch = text.match(/(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:mail|email)?/i);

        let index = -1;
        if (digitMatch) index = parseInt(digitMatch[1]) - 1;
        if (wordMatch) index = wordMap[wordMatch[1]] - 1;

        if (index >= 0 && inboxEmails.length > index) {
          const target = inboxEmails[index];
          await openEmail(target.id);
          return;
        }

        // Default: Read first if specific one not asked
        // ... (existing logic fallback if needed)
        return;
      }

      // 🧠 SUMMARIZE CURRENT EMAIL
      if (text.includes("summarize")) {
        await summarizeCurrentEmail();
        return;
      }

      // ✍️ GENERATE REPLY
      if (text.includes("reply")) {
        await generateReply("polite");
        return;
      }

      // 📤 SEND REPLY
      if (text.includes("send") && !text.includes("email to")) {
        await sendReply();
        return;
      }

      // ✉️ COMPOSE
      if (text.includes("compose")) {
        setIsComposeOpen(true);
        return;
      }

      setError("Unrecognized Gmail command");
    } catch (err: any) {
      setError(err.message || "Gmail voice command failed");
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

  const generateReply = async (
    tone: "polite" | "short" | "professional"
  ) => {
    if (!selectedEmail) return;
    try {
      setLoading(true);
      const reply = await generateReplyDraft({
        emailBody: selectedEmail.body,
        sender: selectedEmail.from,
        tone,
      });
      setReplyDraft(reply.draft);

      // Also update composeData so the privacy layer can acknowledge it in UI
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
      await replyToEmail(
        selectedEmail.threadId,
        selectedEmail.from,
        selectedEmail.subject,
        replyDraft
      );
      setReplyDraft(null);
    } catch (err: any) {
      setError(err.message || "Failed to send reply");
      throw err; // Re-throw for voice feedback
    } finally {
      setLoading(false);
    }
  };

  const sendNewEmail = async (to: string, subject: string, body: string) => {
    try {
      setLoading(true);
      await sendEmail(to, subject, body);
    } catch (err: any) {
      setError(err.message || "Failed to send email");
      throw err; // Re-throw for voice feedback
    } finally {
      setLoading(false);
    }
  };

  // 🔄 REFRESH WHEN SECTION CHANGES
  useEffect(() => {
    if (oauthConnected) {
      fetchInboxViaOAuth();
    }
  }, [currentSection]);

  // 🔄 BACKGROUND POLLING (RE-ENABLED FOR LIVE UPDATES)
  useEffect(() => {
    if (!oauthConnected) return;

    const poll = async () => {
      if (document.hidden) return;
      console.log("[GMAIL] Background polling for new messages...");
      fetchInboxViaOAuth();
    };

    const interval = setInterval(poll, 60000); // Check every 60 seconds
    return () => clearInterval(interval);
  }, [oauthConnected, currentSection]);

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
  if (!context) {
    throw new Error("useGmail must be used within GmailProvider");
  }
  return context;
};
