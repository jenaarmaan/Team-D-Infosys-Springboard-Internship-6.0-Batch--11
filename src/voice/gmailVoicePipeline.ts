/*
// DEPRECATED: This file violates the boundaries of SP2 (Voice Runtime) and SP4 (Platform Execution).
// Logic here will be moved to the Intent Engine (SP3) and Gmail Adapter (SP4).

import { VoiceCommandResult } from "./voiceTypes";

interface GmailVoiceActions {
  fetchInboxEmails?: () => Promise<void>;
  inboxEmails?: any[];
  openEmail?: (id: string) => Promise<void>;
  selectedEmail?: any;
  summarizeCurrentEmail?: () => Promise<void>;
  generateReply?: (tone: "polite" | "short" | "professional") => Promise<void>;
  sendReply?: () => Promise<void>;
}

export async function handleGmailVoiceCommand(
  transcript: string,
  gmail: GmailVoiceActions
): Promise<VoiceCommandResult> {
  // ... handled by SP3 / SP4 now ...
  return { handled: false };
}
*/
export { };

