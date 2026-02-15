import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { auth, db } from "@/lib/firebase/firebase";
import { collection, query, onSnapshot, orderBy, limit } from "firebase/firestore";
import { getTelegramClient } from "@/lib/telegram/telegramClient";
import { TelegramMessage, TelegramChat } from "@/lib/telegram/telegramTypes";
import { useSettings } from "@/contexts/SettingsContext";
import { speakText } from "@/services/ttsService";

interface TelegramContextType {
    messages: TelegramMessage[];
    unreadChats: TelegramChat[];
    lastReceivedMessage: TelegramMessage | null;
    loading: boolean;
    isConnected: boolean;
    activeChatId: number | null;
    isPopupOpen: boolean;
    currentSummary: string | null;
    currentDraft: string | null;
    error: string | null;
    history: Record<number, TelegramMessage[]>;

    updateMessages: (msgs: TelegramMessage[]) => void;
    updateSummary: (summary: string | null) => void;
    updateDraft: (draft: string | null) => void;
    updateUnreadChats: (chats: TelegramChat[]) => void;
    selectChat: (chatId: number | null) => void;
    closeChat: () => void;
    fetchChats: () => Promise<void>;
    fetchMessages: (chatId?: number) => Promise<void>;
    summarizeMessages: (chatId?: number) => Promise<void>;
    sendMessage: (chatId: number, text: string) => Promise<boolean>;
}

const TelegramContext = createContext<TelegramContextType | undefined>(undefined);

export const TelegramProvider = ({ children }: { children: ReactNode }) => {
    const [messages, setMessages] = useState<TelegramMessage[]>([]);
    const [unreadChats, setUnreadChats] = useState<TelegramChat[]>([]);
    const [lastReceivedMessage, setLastReceivedMessage] = useState<TelegramMessage | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [activeChatId, setActiveChatId] = useState<number | null>(null);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [currentSummary, setCurrentSummary] = useState<string | null>(null);
    const [currentDraft, setCurrentDraft] = useState<string | null>(null);
    const [history, setHistory] = useState<Record<number, TelegramMessage[]>>({});


    const client = getTelegramClient();
    const settings = useSettings();
    const [processedMessageIds] = useState(new Set<number>());

    useEffect(() => {
        if (client) {
            setIsConnected(client.isConnectedStatus());
        } else {
            setIsConnected(false);
        }
    }, [client]);

    // 💾 Persistence: Load history from localStorage on boot
    useEffect(() => {
        try {
            const stored = localStorage.getItem("govind_telegram_history");
            if (stored) {
                const parsed = JSON.parse(stored);
                // Convert date strings back to Date objects
                Object.keys(parsed).forEach(chatId => {
                    parsed[chatId].forEach((m: any) => {
                        m.date = new Date(m.date);
                    });
                });
                setHistory(parsed);
            }
        } catch (e) {
            console.error("[TELEGRAM] Failed to load local history", e);
        }
    }, []);

    // 💾 Persistence: Save history to localStorage whenever it changes
    useEffect(() => {
        if (Object.keys(history).length > 0) {
            localStorage.setItem("govind_telegram_history", JSON.stringify(history));
        }
    }, [history]);

    const mergeUpdatesToHistory = useCallback((newMessages: Record<number, TelegramMessage[]>) => {
        setHistory(prev => {
            const next = { ...prev };
            Object.entries(newMessages).forEach(([chatIdStr, msgs]) => {
                const chatId = Number(chatIdStr);
                const existing = next[chatId] || [];

                // Merge and deduplicate by message ID
                const messageMap = new Map();
                existing.forEach(m => messageMap.set(m.id, m));
                msgs.forEach(m => messageMap.set(m.id, m));

                // Sort by date descending
                next[chatId] = Array.from(messageMap.values())
                    .sort((a, b) => b.date.getTime() - a.date.getTime())
                    .slice(0, 50); // Keep up to 50 per chat
            });
            return next;
        });
    }, []);

    const fetchChats = useCallback(async () => {
        if (!client) return;
        setLoading(true);
        setError(null);
        try {
            console.log("[TELEGRAM] Performing Deep Sync...");
            const { chats, messages: syncMessages } = await client.getRecentContext();
            setUnreadChats(chats);

            // Merge into persistent history
            mergeUpdatesToHistory(syncMessages);
        } catch (err: any) {
            setError(err.message || "Failed to fetch Telegram chats");
        } finally {
            setLoading(false);
        }
    }, [client, mergeUpdatesToHistory]);

    // 🔗 Real-time Firestore Listener (Production Replacement for Polling)
    useEffect(() => {
        if (!client || !isConnected) return;

        // 🔒 Only start listener if user is authenticated (prevents permission errors)
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (!user) {
                console.log("[TELEGRAM] Waiting for auth before starting real-time listener...");
                return;
            }

            console.log("[TELEGRAM] Initializing Firestore real-time listener for", user.email);

            console.log("Firestore path UID:", user.uid);
            console.log("Firestore path EMAIL:", user.email);
            // Listen for new updates in the telegram_updates collection
            const updatesRef = collection(db, "telegram_updates");
            const q = query(
                updatesRef,
                orderBy("date", "desc"),
                limit(100)
            );

            const snapshotUnsub = onSnapshot(q, (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === "added") {
                        const updateData = change.doc.data();
                        const parsedUpdate = {
                            id: change.doc.id,
                            chatId: updateData.chatId,
                            senderId: updateData.senderId,
                            senderName: updateData.senderName,
                            text: updateData.text,
                            date: updateData.date,
                            chatTitle: updateData.chatTitle || updateData.senderName || "Unknown",
                            chatType: updateData.chatType || "private"
                        };

                        client.updateCacheFromFirestore(parsedUpdate);

                        if (settings.messageAlerts && parsedUpdate.senderId !== 0 && !processedMessageIds.has(Number(parsedUpdate.id))) {
                            const announcement = `New message from ${parsedUpdate.senderName}: ${parsedUpdate.text.substring(0, 40)}`;
                            speakText(announcement, { volume: settings.speechVolume / 100, rate: settings.speechRate / 50 });
                        }
                    }
                });

                client.getRecentContext().then(({ chats, messages: polledMessages }) => {
                    setUnreadChats(chats);
                    mergeUpdatesToHistory(polledMessages);
                });
            }, (err) => {
                console.error("[TELEGRAM] Firestore listener error:", err);
                setError("Real-time sync failed. Please refresh.");
            });

            return () => snapshotUnsub();
        });

        return () => unsubscribe();
    }, [client, isConnected, mergeUpdatesToHistory, settings.messageAlerts, settings.speechVolume, settings.speechRate]);

    // 🔄 Sync Active Chat Messages from History
    useEffect(() => {
        if (activeChatId && history[activeChatId]) {
            const chatMsgs = history[activeChatId];
            setMessages(chatMsgs);
            if (chatMsgs.length > 0) {
                setLastReceivedMessage(chatMsgs[0]);
            }
        } else if (activeChatId && !history[activeChatId]) {
            setMessages([]);
        }
    }, [activeChatId, history]);

    const fetchMessages = useCallback(async (chatId?: number) => {
        setLoading(true);
        try {
            const targetChatId = chatId || activeChatId || -1;

            // Trigger an immediate Deep Sync to catch up
            if (client) {
                const { messages: polledMessages } = await client.getRecentContext();
                if (Object.keys(polledMessages).length > 0) {
                    mergeUpdatesToHistory(polledMessages);
                }
            }
        } catch (err: any) {
            console.error("[TELEGRAM] Fetch Messages Error:", err);
            setError(err.message || "Failed to fetch Telegram messages");
        } finally {
            setLoading(false);
        }
    }, [activeChatId, client, mergeUpdatesToHistory]);

    const summarizeMessages = useCallback(async (chatId?: number): Promise<void> => {
        setLoading(true);
        try {
            const targetChatId = chatId || activeChatId || -1;
            const chatMessages = history[targetChatId] || [];

            if (chatMessages.length > 0) {
                const latestMsg = chatMessages[0];
                const senderCount = new Set(chatMessages.map(m => m.senderId)).size;
                const summary = `This thread contains ${chatMessages.length} recent messages from ${senderCount} participant(s). The most recent message was from ${latestMsg.senderName} saying: "${latestMsg.text.substring(0, 50)}${latestMsg.text.length > 50 ? '...' : ''}"`;
                setCurrentSummary(summary);
            } else {
                setCurrentSummary("No recent message history found to summarize for this chat.");
            }
        } catch (err: any) {
            setError(err.message || "Failed to summarize");
        } finally {
            setLoading(false);
        }
    }, [activeChatId, history, client]);

    const sendMessage = useCallback(async (chatId: number, text: string): Promise<boolean> => {
        if (!client) return false;
        setLoading(true);
        try {
            const res = await client.sendMessage(chatId, text);
            if (res.success) {
                // Manually append outgoing message to history so it shows up
                const outgoing: TelegramMessage = {
                    id: res.messageId || Date.now(),
                    chatId,
                    senderId: 0, // Bot
                    senderName: "You",
                    text,
                    date: new Date()
                };
                mergeUpdatesToHistory({ [chatId]: [outgoing] });
                return true;
            }
            return false;
        } catch (err: any) {
            setError(err.message || "Failed to send");
            return false;
        } finally {
            setLoading(false);
        }
    }, [client, mergeUpdatesToHistory]);

    const updateMessages = useCallback((msgs: TelegramMessage[]) => {
        setMessages(msgs);
        if (msgs.length > 0) setLastReceivedMessage(msgs[0]);
    }, []);

    const updateSummary = useCallback((s: string | null) => {
        setCurrentSummary(s);
        console.log("[TELEGRAM] Summary updated:", s);
    }, []);

    const updateDraft = useCallback((d: string | null) => {
        setCurrentDraft(d);
    }, []);

    const updateUnreadChats = useCallback((chats: TelegramChat[]) => {
        setUnreadChats(chats);
    }, []);

    const selectChat = useCallback((chatId: number | null) => {
        setActiveChatId(chatId);
        if (client) {
            client.activeChatId = chatId;
        }

        if (chatId) {
            setIsPopupOpen(true);
            // Immediate sync when opening
            fetchMessages(chatId);
        } else {
            setIsPopupOpen(false);
        }
    }, [client, fetchMessages]);

    const closeChat = useCallback(() => {
        setIsPopupOpen(false);
        setActiveChatId(null);
        setCurrentSummary(null);
        setCurrentDraft(null);
    }, []);

    return (
        <TelegramContext.Provider
            value={{
                messages,
                unreadChats,
                lastReceivedMessage,
                currentSummary,
                currentDraft,
                loading,
                error,
                isConnected,
                activeChatId,
                isPopupOpen,
                history,
                updateMessages,
                updateSummary,
                updateDraft,
                updateUnreadChats,
                selectChat,
                closeChat,
                fetchChats,
                fetchMessages,
                summarizeMessages,
                sendMessage
            }}
        >
            {children}
        </TelegramContext.Provider>
    );
};

export const useTelegram = () => {
    const context = useContext(TelegramContext);
    if (!context) {
        throw new Error("useTelegram must be used within TelegramProvider");
    }
    return context;
};
