import React from 'react';
import { useTelegram } from '@/contexts/TelegramContext';
import { useGovind } from '@/contexts/GovindContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, X, Send } from 'lucide-react';

export const TelegramChatModal = () => {
    const {
        isPopupOpen,
        closeChat,
        activeChatId,
        unreadChats,
        messages,
        loading,
        currentSummary,
        currentDraft,
        updateSummary,
        updateDraft,
        error
    } = useTelegram();
    const { speak } = useGovind();

    const activeChat = unreadChats.find(c => c.id === activeChatId) ||
        (activeChatId ? { title: history[activeChatId]?.[0]?.chatTitle || "Private Chat" } : null);

    const handleMessageClick = (msg: any) => {
        speak(`Message from ${msg.senderName}: ${msg.text}`);
    };

    if (!activeChatId || !isPopupOpen) return null;

    return (
        <div className="fixed bottom-0 right-[340px] w-[380px] h-[550px] z-40 bg-slate-950 border border-slate-800 text-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-300 rounded-t-xl bg-opacity-95 backdrop-blur-xl">
            <div className="p-3 border-b border-white/5 flex flex-row items-center justify-between bg-slate-900/80">
                <div className="text-xs font-bold flex items-center gap-2">
                    <Send className="w-3.5 h-3.5 text-[#0088cc]" />
                    <span className="truncate max-w-[200px]">{activeChat?.title || "Telegram Chat"}</span>
                </div>
                <Button variant="ghost" size="icon" onClick={closeChat} className="h-7 w-7 rounded-full hover:bg-white/10">
                    <X className="w-3.5 h-3.5" />
                </Button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col p-3 space-y-3">
                {/* AI Intelligence Sections */}
                <div className="space-y-2">
                    {currentSummary && (
                        <Card className="bg-[#0088cc]/10 border-[#0088cc]/30 animate-in fade-in slide-in-from-top-4 duration-500">
                            <CardHeader className="p-2 pb-1">
                                <CardTitle className="text-[9px] font-bold uppercase tracking-wider flex items-center gap-2 text-[#0088cc]">
                                    <Bot className="w-3 h-3" />
                                    Summary
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-2 pt-0">
                                <p className="text-[11px] text-white/90 leading-relaxed italic">"{currentSummary}"</p>
                                <Button variant="link" size="sm" className="h-auto p-0 text-[9px] text-[#0088cc]/70 hover:text-[#0088cc]" onClick={() => updateSummary(null)}>
                                    Dismiss
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {currentDraft && (
                        <Card className="bg-orange-500/10 border-orange-500/30 animate-in fade-in zoom-in-95 duration-500">
                            <CardHeader className="p-2 pb-1">
                                <CardTitle className="text-[9px] font-bold uppercase tracking-wider flex items-center gap-2 text-orange-500">
                                    <Bot className="w-3 h-3" />
                                    AI Suggested Reply
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-2 pt-0">
                                <div className="p-2 bg-black/40 rounded border border-orange-500/10 mb-2">
                                    <p className="text-[11px] text-orange-200">{currentDraft}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white text-[9px] h-5 px-2" onClick={() => speak("I've drafted this. Say 'Send it' to confirm.")}>
                                        Confirm via Voice
                                    </Button>
                                    <Button variant="ghost" size="sm" className="text-[9px] h-5 px-2 text-orange-400 hover:text-orange-300" onClick={() => updateDraft(null)}>
                                        Cancel
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Messages Scroll Area */}
                <ScrollArea className="flex-1 pr-3">
                    <div className="space-y-2.5">
                        {loading && <div className="text-center text-[10px] text-muted-foreground animate-pulse py-4 italic">Syncing live thread...</div>}

                        {error && (
                            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[11px] font-medium text-center">
                                <p className="font-bold mb-0.5">Sync Error</p>
                                <p className="opacity-80 text-[10px]">{error}</p>
                            </div>
                        )}

                        {!error && messages.length === 0 && !loading && (
                            <div className="text-center py-10 opacity-30 italic text-[11px]">No messages yet...</div>
                        )}

                        {!error && [...messages].reverse().map((msg) => (
                            <div
                                key={msg.id}
                                onClick={() => handleMessageClick(msg)}
                                className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer border border-white/5 hover:border-[#0088cc]/20 group"
                            >
                                <div className="flex justify-between items-start mb-0.5">
                                    <div className="text-[10px] font-bold text-[#0088cc] uppercase tracking-tight">{msg.senderName}</div>
                                    <span className="text-[8px] text-muted-foreground font-mono opacity-60">
                                        {new Date(msg.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <p className="text-[12px] text-white/90 leading-normal">{msg.text}</p>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </div>

            <div className="p-2.5 bg-black/40 border-t border-white/5 flex items-center justify-between">
                <p className="text-[9px] text-muted-foreground flex items-center gap-1.5 italic">
                    <Bot className="w-3 h-3 text-[#0088cc]" />
                    Say "Send quick response"
                </p>
                <Button variant="outline" size="sm" onClick={closeChat} className="h-6 text-[9px] bg-transparent border-white/10 hover:bg-white/5 px-2">
                    Minimize
                </Button>
            </div>
        </div>
    );
};
