import { Layout } from '@/components/layout/Layout';
import { useGovind } from '@/contexts/GovindContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useGmail } from "@/contexts/GmailContext";

import {
  Mail,
  Star,
  Trash2,
  Archive,
  Mic,
  RefreshCcw,
  Inbox,
  Send,
  File
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

// 🔹 ADD THIS IMPORT
// import { connectGmail } from '@/lib/google/googleOAuth';

interface Email {
  id: string;
  from: string;
  subject: string;
  preview: string;
  time: string;
  read: boolean;
  starred: boolean;
  labels: string[];
}

const Gmail = () => {
  const { speak, addMessage } = useGovind();


  /* ======================================================
     ✅ REAL GMAIL CONTEXT (UNREAD ONLY)
     ====================================================== */

  const {

    oauthConnected,
    inboxEmails,
    selectedEmail,
    loading,
    error,
    fetchInboxViaOAuth,
    openEmail,
    closeEmail,
    summarizeCurrentEmail,
    generateReply,
    sendReply,
    sendNewEmail,

    // ✉️ COMPOSE
    isComposeOpen,
    setIsComposeOpen,
    composeData,
    setComposeData,

    currentSection,
    changeSection


  } = useGmail();

  /* ======================================================
     ✅ SINGLE SOURCE OF TRUTH — REAL GMAIL ONLY
     ====================================================== */

  const emails = inboxEmails || [];
  const unreadCount = emails.length;

  /* ======================================================
     🎤 VOICE: READ UNREAD COUNT
     ====================================================== */

  const handleReadUnread = () => {
    addMessage('user', 'Read my unread emails');

    if (emails.length === 0) {
      speak("You have no unread emails.");
    } else {
      const first = emails[0];
      speak(
        `You have ${emails.length} unread emails. 
         The most recent is from ${first.from}, subject ${first.subject}.`
      );
    }
  };

  /* ======================================================
     🔄 AUTO FETCH UNREAD EMAILS AFTER OAUTH
     ====================================================== */

  /* ======================================================
     🔄 AUTO FETCH UNREAD EMAILS ON MOUNT
     ====================================================== */

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem("gmail_oauth_token");
      if (token || oauthConnected) {
        fetchInboxViaOAuth();
      }
    }
    init();
  }, [oauthConnected]);

  /* ======================================================
     🔐 HANDLE AUTH ERROR (APP PASSWORD FALLBACK FLOW)
     ====================================================== */
  const startGmailOAuth = () => {
    const url = "https://accounts.google.com/o/oauth2/v2/auth" +
      `?client_id=${import.meta.env.VITE_GOOGLE_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(window.location.origin + "/gmail-oauth")}` +
      `&response_type=token` +
      `&scope=${encodeURIComponent("https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send")}` +
      `&prompt=consent`;

    window.location.href = url;
  };

  useEffect(() => {
    if (error === "AUTH_ERROR") {
      speak("I am not able to fetch your mails through your google app password. We will have to do OAuth to fetch your mails.");

      // Wait for speech then redirect
      const timer = setTimeout(() => {
        startGmailOAuth();
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);



  const folders = [
    { id: 'inbox', icon: Inbox, label: 'Inbox', count: unreadCount },
    { id: 'starred', icon: Star, label: 'Starred', count: 0 },
    { id: 'sent', icon: Send, label: 'Sent', count: 0 },
    { id: 'drafts', icon: File, label: 'Drafts', count: 0 },
    { id: 'trash', icon: Trash2, label: 'Trash', count: 0 },
  ];

  return (
    <Layout>
      <div className="h-[calc(100vh-4rem)] flex">

        {/* Sidebar */}
        <div className="w-56 border-r border-border/50 p-4 hidden lg:block">
          <Button className="w-full mb-4" onClick={() => {
            addMessage('user', 'Compose new email');
            speak("Who would you like to send an email to?");
          }}>
            <Mail className="w-4 h-4 mr-2" />
            Compose
          </Button>

          <nav className="space-y-1">
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => changeSection(folder.id)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left",
                  currentSection === folder.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-secondary text-muted-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <folder.icon className={cn("w-4 h-4", currentSection === folder.id ? "text-primary" : "text-muted-foreground")} />
                  <span>{folder.label}</span>
                </div>
                {folder.count > 0 && (
                  <span className="text-xs">{folder.count}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">

          {/* Toolbar */}
          <div className="p-4 border-b border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-semibold capitalize">
                {currentSection === 'inbox' ? 'Unread Inbox' : `${currentSection} Mail`}
              </h1>
              {currentSection === 'inbox' && <Badge variant="secondary">{unreadCount} unread</Badge>}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleReadUnread}>
                <Mic className="w-4 h-4" />
              </Button>

              {/* <Button
  variant="ghost"
  size="icon"
  // onClick={() => {
  //   if (oauthConnected) {
  //     fetchInboxViaOAuth();
  //   } else {
  //     refreshInbox?.();
  //   }
  // }}
>
  <RefreshCcw className="w-4 h-4" />
</Button> */}


              {/* 🔐 ONE-TIME OAUTH */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  speak("Redirecting to Google for Gmail authentication.");
                  startGmailOAuth();
                }}
              >
                Connect Gmail
              </Button>


            </div>
          </div>

          {/* STATUS */}
          {loading && <p className="text-sm p-2">Loading unread emails…</p>}
          {error && <p className="text-sm p-2 text-red-500">{error}</p>}

          {/* Inbox */}
          <ScrollArea className="flex-1">
            <div className="divide-y divide-border/50">
              {emails.length === 0 && !loading && (
                <p className="p-4 text-sm text-muted-foreground">
                  No unread emails 🎉
                </p>
              )}

              {emails.map((email: any, i: number) => (
                <div
                  key={email.id}
                  onClick={() => openEmail?.(email.id)}
                  className={cn(
                    "flex items-start gap-4 p-4 cursor-pointer transition-colors hover:bg-secondary/50 bg-secondary/30"
                  )}
                >
                  <div className="flex flex-col items-center gap-1 mr-2">
                    <span className="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                      #{i + 1}
                    </span>
                    <Star className="w-4 h-4 text-muted-foreground mt-1" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold truncate">
                      {email.from}
                    </span>
                    <p className="text-sm truncate">{email.subject}</p>
                  </div>

                  <Archive className="w-4 h-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* 📖 EMAIL READING MODAL */}
      {selectedEmail && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <Card className="w-full max-w-2xl bg-card shadow-2xl border-border max-h-[80vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
              <div className="flex-1 min-w-0">
                <CardTitle className="truncate">{selectedEmail.subject}</CardTitle>
                <p className="text-sm text-muted-foreground">{selectedEmail.from}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => closeEmail?.()}>
                X
              </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="prose dark:prose-invert max-w-none text-sm">
                {selectedEmail.body}
              </div>

              {selectedEmail.summary && (
                <div className="bg-secondary/50 p-3 rounded-lg border border-primary/20">
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-primary mb-1">✨ AI Summary</h4>
                  <p className="text-sm">{selectedEmail.summary}</p>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t">
                <Button variant="outline" size="sm" onClick={() => summarizeCurrentEmail?.()}>
                  ✨ Summarize
                </Button>
                <Button variant="default" size="sm" onClick={() => {
                  setIsComposeOpen(true);
                  setComposeData({ to: selectedEmail.from, subject: `Re: ${selectedEmail.subject}`, body: '' });
                }}>
                  <Send className="w-3 h-3 mr-2" /> Reply
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {/* 📧 COMPOSE MODAL */}
      {isComposeOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg bg-card shadow-2xl border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>New Message</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setIsComposeOpen(false)}>
                X
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <input
                  placeholder="To"
                  className="w-full p-2 rounded bg-secondary/50 border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                  value={composeData.to}
                  onChange={(e) => setComposeData({ ...composeData, to: e.target.value })}
                />
                <input
                  placeholder="Subject"
                  className="w-full p-2 rounded bg-secondary/50 border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                  value={composeData.subject}
                  onChange={(e) => setComposeData({ ...composeData, subject: e.target.value })}
                />
                <textarea
                  placeholder="Type your message here..."
                  className="w-full p-2 h-40 rounded bg-secondary/50 border border-border resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  value={composeData.body}
                  onChange={(e) => setComposeData({ ...composeData, body: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setIsComposeOpen(false)}>Cancel</Button>
                <Button onClick={() => {
                  sendNewEmail?.(composeData.to, composeData.subject, composeData.body);
                  speak(`Sending email to ${composeData.to}`);
                  setIsComposeOpen(false);
                }}>
                  Send <Send className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </Layout>
  );
};

export default Gmail;
