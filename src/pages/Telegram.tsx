import React, { useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTelegramClient } from "@/lib/telegram/telegramClient";
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Bot, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useTelegram } from '@/contexts/TelegramContext';
import { useGovind } from '@/contexts/GovindContext';
import { TelegramChatModal } from '@/components/telegram/TelegramChatModal';

const Telegram = () => {
    const navigate = useNavigate();
    const { speak } = useGovind();
    const {
        unreadChats,
        isConnected,
        activeChatId,
        updateUnreadChats,
        selectChat,
        fetchChats,
        error
    } = useTelegram();

    useEffect(() => {
        if (isConnected) {
            fetchChats();
        }
    }, [isConnected, fetchChats]);

    const handleChatClick = (chat: any) => {
        selectChat(chat.id);
    };

    if (!isConnected) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
                <div className="relative">
                    <div className="absolute -inset-4 bg-[#0088cc]/20 rounded-full blur-xl animate-pulse" />
                    <Send className="w-16 h-16 text-[#0088cc] relative" />
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-white">Telegram Not Connected</h1>
                <p className="text-muted-foreground text-center max-w-md">
                    Please ensure your Telegram API credentials are set in the environment variables and the client is initialized.
                </p>
                <div className="flex gap-4">
                    <Button variant="outline" onClick={() => navigate("/dashboard")}>Return to Dashboard</Button>
                    <Button className="bg-[#0088cc] hover:bg-[#0088cc]/90 text-white">Retry Connection</Button>
                </div>
            </div>
        );
    }

    return (
        <Layout>
            <div className="space-y-8 animate-in fade-in duration-700 pb-20 p-4 md:p-8 max-w-6xl mx-auto">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-4xl font-bold tracking-tight flex items-center gap-3 text-white">
                            <Send className="w-8 h-8 text-[#0088cc]" />
                            Telegram Assistant
                        </h1>
                        <p className="text-muted-foreground italic">
                            Voice-controlled messaging at your command.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-medium">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        LIVE PIPELINE ACTIVE
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Main Content Area: Chat List Overview */}
                    <div className="md:col-span-2 space-y-6">
                        <Card className="bg-card/30 backdrop-blur-sm border-border/50">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2 text-white font-semibold">
                                    <Users className="w-4 h-4 text-[#0088cc]" />
                                    Active Conversations
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {error && (
                                    <div className="mb-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-3">
                                        <Bot className="w-5 h-5" />
                                        <div>
                                            <p className="font-bold">Fetch Error</p>
                                            <p className="text-xs opacity-80">{error}</p>
                                            {error.includes("Failed to fetch") && (
                                                <p className="mt-2 text-[10px] text-white/50">
                                                    Check your browser console for CSP errors. You might need to allow Telegram's API in your index.html.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <div className="grid gap-4">
                                    {unreadChats.map(chat => (
                                        <div
                                            key={chat.id}
                                            onClick={() => handleChatClick(chat)}
                                            className="p-4 rounded-xl bg-slate-900/50 hover:bg-[#0088cc]/5 transition-all cursor-pointer border border-white/5 hover:border-[#0088cc]/30 group"
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="font-semibold text-lg text-white group-hover:text-[#0088cc] transition-colors">{chat.title}</div>
                                                {chat.unreadCount && (
                                                    <span className="bg-[#0088cc] text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                                                        {chat.unreadCount} NEW
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-white/50 line-clamp-1 italic">
                                                "{chat.lastMessage}"
                                            </p>
                                        </div>
                                    ))}
                                    {!error && unreadChats.length === 0 && (
                                        <div className="text-center py-10 space-y-6">
                                            <div className="p-6 rounded-2xl bg-[#0088cc]/5 border border-[#0088cc]/20 max-w-sm mx-auto">
                                                <Bot className="w-12 h-12 text-[#0088cc] mx-auto mb-4 animate-bounce" />
                                                <h3 className="text-lg font-bold text-white mb-2">Link Your Telegram</h3>
                                                <p className="text-sm text-muted-foreground mb-6">
                                                    To see your messages here, you need to link your Telegram account to Govind.
                                                </p>

                                                <div className="space-y-4 text-left">
                                                    <div className="flex gap-3 items-start">
                                                        <div className="w-5 h-5 rounded-full bg-[#0088cc] text-white text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</div>
                                                        <p className="text-xs text-white/80">Open <a href="https://t.me/your_bot_name" target="_blank" className="text-[#0088cc] underline">@VoiceMailBot</a> on Telegram</p>
                                                    </div>
                                                    <div className="flex gap-3 items-start">
                                                        <div className="w-5 h-5 rounded-full bg-[#0088cc] text-white text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</div>
                                                        <p className="text-xs text-white/80">Send the command: <strong>/link</strong> followed by your email</p>
                                                    </div>
                                                </div>

                                                <div className="mt-8 pt-6 border-t border-[#0088cc]/10">
                                                    <p className="text-[10px] text-muted-foreground italic">
                                                        Govind uses end-to-end mapping to ensure your messages stay private.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Sidebar Context */}
                    <div className="space-y-6">
                        <Card className="bg-[#0088cc]/5 border-[#0088cc]/20">
                            <CardHeader>
                                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-white">
                                    <Bot className="w-4 h-4 text-[#0088cc]" />
                                    Voice Commands
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="p-3 rounded bg-black/40 text-[11px] font-mono text-[#0088cc] border border-[#0088cc]/10 shadow-inner">
                                    "Hey Govind, what are my latest telegrams?"
                                </div>
                                <div className="p-3 rounded bg-black/40 text-[11px] font-mono text-[#0088cc] border border-[#0088cc]/10 shadow-inner">
                                    "Open chat with Armaan"
                                </div>
                                <div className="p-3 rounded bg-black/40 text-[11px] font-mono text-[#0088cc] border border-[#0088cc]/10 shadow-inner">
                                    "Close this chat"
                                </div>
                                <div className="p-3 rounded bg-black/40 text-[11px] font-mono text-orange-500 border border-orange-500/10 shadow-inner">
                                    "Summarize this conversation"
                                </div>
                            </CardContent>
                        </Card>

                        <div className="p-5 rounded-2xl bg-gradient-to-br from-[#0088cc]/20 to-transparent border border-[#0088cc]/20 shadow-xl">
                            <p className="text-[10px] font-bold text-[#0088cc] uppercase flex items-center gap-2 mb-2">
                                <Bot className="w-3 h-3 text-white" /> Pro Assistant Tip
                            </p>
                            <p className="text-[12px] text-white/70 leading-relaxed italic">
                                Clicking a chat opens it as a <strong>popup window</strong>, allowing you to manage multiple threads while keeping the main dashboard clear.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Floating Chat Modal */}
            <TelegramChatModal />
        </Layout>
    );
};

export default Telegram;
