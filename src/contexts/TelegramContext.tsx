import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { auth, db } from "@/lib/firebase/firebase";
import { collection, query, onSnapshot, orderBy, limit } from "firebase/firestore";
import { getTelegramClient } from "@/lib/telegram/telegramClient";
import { TelegramMessage, TelegramChat } from "@/lib/telegram/telegramTypes";
import { useSettings } from "@/contexts/SettingsContext";
import { speakText } from "@/services/ttsService";
import { toast } from "sonner";

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
    const [processedIds] = useState(new Set<string>());

    const client = getTelegramClient();
    const settings = useSettings();

    // 1. Persistence
    useEffect(() => {
        try {
            const stored = localStorage.getItem("govind_telegram_history");
            if (stored) {
                const parsed = JSON.parse(stored);
                Object.keys(parsed).forEach(id => {
                    parsed[id].forEach((m: any) => m.date = new Date(m.date));
                });
                setHistory(parsed);
            }
        } catch (e) { }
    }, []);

    useEffect(() => {
        if (Object.keys(history).length > 0) {
            localStorage.setItem("govind_telegram_history", JSON.stringify(history));
        }
    }, [history]);

    const mergeUpdates = useCallback((updates: Record<number, TelegramMessage[]>) => {
        if (!updates || Object.keys(updates).length === 0) return;
        setHistory(prev => {
            const next = { ...prev };
            Object.entries(updates).forEach(([id, msgs]) => {
                const chatId = Number(id);
                const existing = next[chatId] || [];
                const map = new Map(existing.map(m => [m.id, m]));
                msgs.forEach(m => map.set(m.id, m));
                next[chatId] = Array.from(map.values()).sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 100);
            });
            return next;
        });
    }, []);

    const fetchChats = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { chats, messages: updates } = await client.getRecentContext();
            setUnreadChats(chats);
            mergeUpdates(updates);
            setIsConnected(true);
        } catch (err: any) {
            console.error("[TG CONTEXT] fetchChats failed:", err.message);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [client, mergeUpdates]);

    // 2. Auth & Firestore Listener
    useEffect(() => {
        const unsubAuth = auth.onAuthStateChanged((user) => {
            if (!user) {
                setIsConnected(false);
                return;
            }

            setIsConnected(true);
            console.log("🔗 [TG LISTENER] Starting for:", user.email);
            const q = query(collection(db, "telegram_updates", user.uid, "updates"), orderBy("date", "desc"), limit(50));

            const unsubSnap = onSnapshot(q, (snap) => {
                console.log(`📡 [TG CONTEXT] Received ${snap.size} Firestore updates`);
                snap.docChanges().forEach(change => {
                    if (change.type === "added") {
                        const data = change.doc.data();
                        const id = change.doc.id;
                        if (processedIds.has(id)) return;
                        processedIds.add(id);

                        const upd = {
                            id,
                            chatId: data.chatId,
                            senderId: data.senderId,
                            senderName: data.senderName,
                            text: data.text,
                            date: data.date,
                            chatTitle: data.chatTitle,
                            chatType: data.chatType
                        };
                        client.updateCacheFromFirestore(upd);

                        if (settings.messageAlerts && data.senderId !== 0) {
                            speakText(`Message from ${upd.senderName}: ${upd.text.substring(0, 30)}`, {
                                volume: settings.speechVolume / 100,
                                rate: settings.speechRate / 50
                            });
                        }
                    }
                });

                // Update UI directly from client cache (no API call needed for realtime)
                const res = client.getRecentContextLocally();
                console.log(`✅ [TG CONTEXT] UI updated with ${res.chats.length} chats from local cache`);
                setUnreadChats([...res.chats]);
                mergeUpdates(res.messages);
            }, (err) => {
                console.error("[TG LISTENER] Permission Error:", err.message);
                setError(`Sync Error: ${err.message}`);
                setIsConnected(false);
            });

            return () => unsubSnap();
        });

        return () => unsubAuth();
    }, [client, mergeUpdates, settings.messageAlerts, settings.speechVolume, settings.speechRate, processedIds]);

    // 3. UI Helpers
    useEffect(() => {
        if (activeChatId && history[activeChatId]) {
            setMessages(history[activeChatId]);
            setLastReceivedMessage(history[activeChatId][0] || null);
        }
    }, [activeChatId, history]);

    const sendMessage = useCallback(async (chatId: number, text: string) => {
        setLoading(true);
        try {
            const res = await client.sendMessage(chatId, text);
            if (res.success) {
                mergeUpdates({ [chatId]: [{ id: Date.now(), chatId, senderId: 0, senderName: "You", text, date: new Date() }] });
                return true;
            }
            toast.error(res.error || "Failed to send");
            return false;
        } finally {
            setLoading(false);
        }
    }, [client, mergeUpdates]);

    const selectChat = useCallback((id: number | null) => {
        setActiveChatId(id);
        setIsPopupOpen(!!id);
    }, []);

    return (
        <TelegramContext.Provider value={{
            messages, unreadChats, lastReceivedMessage, currentSummary, currentDraft,
            loading, error, isConnected, activeChatId, isPopupOpen, history,
            updateMessages: setMessages, updateSummary: setCurrentSummary, updateDraft: setCurrentDraft,
            updateUnreadChats: setUnreadChats, selectChat, closeChat: () => setIsPopupOpen(false),
            fetchChats, fetchMessages: async () => { }, summarizeMessages: async () => { }, sendMessage
        }}>
            {children}
        </TelegramContext.Provider>
    );
};

export const useTelegram = () => {
    const context = useContext(TelegramContext);
    if (!context) throw new Error("useTelegram must be used within TelegramProvider");
    return context;
};
