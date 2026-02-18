// src/lib/govind/intentMap.ts

export type IntentAction =
  | "READ"
  | "DRAFT"
  | "REPLY"
  | "SEND"
  | "SUMMARIZE"
  | "LOGIN"
  | "LOGOUT"
  | "REGISTER"
  | "OPEN_PLATFORM"
  | "VIEW_FOLDER"
  | "CLOSE_CHAT"
  | "EXIT"
  | "CONFIRM"
  | "CANCEL"
  | "UNKNOWN";

export type TargetPlatform = "gmail" | "outlook" | "telegram" | "system";

export interface ResolvedIntent {
  action: IntentAction;
  platform: TargetPlatform;
  text: string; // ✅ ADDED
  entities: {
    to?: string;
    subject?: string;
    body?: string;
    messageId?: string;
    chatId?: string;
    query?: string;
  };
}

const intentPatterns: { action: IntentAction; platform: TargetPlatform; keywords: string[] }[] = [
  // Navigation (Specific first)
  { action: "OPEN_PLATFORM", platform: "gmail", keywords: ["open gmail", "go to gmail", "launch gmail"] },
  { action: "VIEW_FOLDER", platform: "gmail", keywords: ["open inbox", "go to inbox", "show inbox", "inbox"] },
  { action: "VIEW_FOLDER", platform: "gmail", keywords: ["open starred", "show starred", "starred", "favorites"] },
  { action: "VIEW_FOLDER", platform: "gmail", keywords: ["open sent", "show sent", "sent", "sent mail"] },
  { action: "VIEW_FOLDER", platform: "gmail", keywords: ["open drafts", "show drafts", "drafts"] },
  { action: "VIEW_FOLDER", platform: "gmail", keywords: ["open trash", "show trash", "trash", "deleted"] },
  { action: "VIEW_FOLDER", platform: "gmail", keywords: ["open spam", "show spam", "spam"] },

  // Telegram Navigation & Discovery
  { action: "OPEN_PLATFORM", platform: "telegram", keywords: ["open telegram", "go to telegram", "launch telegram", "open tg", "switch to telegram", "telegram"] },
  { action: "VIEW_FOLDER", platform: "telegram", keywords: ["show chats", "telegram main", "back to telegram"] },
  { action: "CLOSE_CHAT", platform: "telegram", keywords: ["close this chat", "close it", "exit chat", "go back to list", "close chat", "close the chat", "close the group", "exit the chat", "close telegram"] },
  { action: "READ", platform: "telegram", keywords: ["read telegram", "check telegram", "read my messages", "check my messages", "what are my messages", "what are my latest messages", "any new messages on telegram", "read my last message", "read last message", "read the last message", "read the latest message", "what was the last message", "tell me the last message", "what he said last", "what she said last"] },
  { action: "READ", platform: "telegram", keywords: ["read unread telegram", "check unread telegram", "unread messages", "who messaged me"] },

  // Specific Chat Navigation (Entities will be parsed)
  { action: "OPEN_PLATFORM", platform: "telegram", keywords: ["open chat with", "go to chat with", "message from", "chat with", "open group", "go to group", "show group", "open the group"] },

  // Refined Send Flows
  { action: "SEND", platform: "telegram", keywords: ["send a quick response", "send a response", "send a quick message", "send a quick reply", "tell them", "reply saying", "message saying"] },
  { action: "SEND", platform: "telegram", keywords: ["send telegram", "message on telegram", "telegram to"] },

  { action: "REPLY", platform: "telegram", keywords: ["reply on telegram", "respond on telegram", "reply to last telegram"] },
  { action: "DRAFT", platform: "telegram", keywords: ["draft a reply", "suggest a reply", "draft a polite reply", "reply via ai"] },
  { action: "SUMMARIZE", platform: "telegram", keywords: ["summarize telegram", "summarise telegram", "summarize my telegram", "summarize this chat", "summarize conversation"] },


  // Specific Gmail Actions (Always checked after platform-specific ones)
  { action: "VIEW_FOLDER", platform: "gmail", keywords: ["open inbox", "go to inbox", "show inbox", "inbox"] },
  { action: "DRAFT", platform: "gmail", keywords: ["draft an email", "draught an email", "suggest a reply"] },
  { action: "SUMMARIZE", platform: "gmail", keywords: ["summarize this email", "summarise this email", "summarize mail", "summarise mail"] },

  // Generic Fallbacks (Checked LAST)
  { action: "READ", platform: "gmail", keywords: ["read my messages", "check my mail", "read my mail", "read the mail", "read first mail", "read my first mail", "read first email", "read my first email", "read the first email", "read my emails", "read my mails", "read mails", "read emails", "check my emails", "what do i have", "open it", "check mailbox"] },
  { action: "SUMMARIZE", platform: "gmail", keywords: ["summarize", "summary", "digest", "what is it about", "summarise"] },
  { action: "REPLY", platform: "gmail", keywords: ["reply", "respond", "answer"] },
  { action: "SEND", platform: "gmail", keywords: ["send", "compose", "write an email"] },
  { action: "DRAFT", platform: "gmail", keywords: ["draft", "draught"] },

  // Confirmation
  { action: "CONFIRM", platform: "system", keywords: ["send it", "yes send", "confirm", "send now"] },
  { action: "CANCEL", platform: "system", keywords: ["cancel", "discard", "don't send", "stop that"] },

  // Auth
  { action: "LOGIN", platform: "system", keywords: ["login", "sign in", "log in"] },
  { action: "REGISTER", platform: "system", keywords: ["register", "sign up", "create account"] },
  { action: "LOGOUT", platform: "system", keywords: ["logout", "sign out"] },
  { action: "EXIT", platform: "system", keywords: ["exit", "stop", "close", "sleep"] },
];

/**
 * 🧠 3A. Intent Detection (STATELESS)
 * Classifies the transcript into an action and platform.
 */
export function detectIntent(text: string): ResolvedIntent {
  const normalized = text.toLowerCase().trim();

  // 1. Check patterns
  for (const pattern of intentPatterns) {
    if (pattern.keywords.some(k => normalized.includes(k))) {
      const entities: any = {};

      if (pattern.action === "VIEW_FOLDER") {
        if (normalized.includes("starred")) entities.query = "starred";
        else if (normalized.includes("sent")) entities.query = "sent";
        else if (normalized.includes("draft")) entities.query = "drafts";
        else if (normalized.includes("trash")) entities.query = "trash";
        else if (normalized.includes("spam")) entities.query = "spam";
        else entities.query = "inbox";
      }

      // 🧠 Entity Extraction for Platform Actions
      const nameCaptures = [
        /(?:with|from|to|for|chat|group|about)\s+([a-z0-9\s]+)$/i,
        /(?:read|summarize|message|open|show)\s+(?:the\s+)?(?:chat|group|message|conversation)?\s+(?:with|from)?\s*([a-z0-9\s]+)$/i
      ];

      if (pattern.platform === "telegram" || pattern.platform === "gmail") {
        for (const regex of nameCaptures) {
          const match = normalized.match(regex);
          if (match && match[1]) {
            const val = match[1].trim();
            // Avoid capturing action keywords as names
            const keywords = ["unread", "last", "latest", "telegram", "gmail", "messages", "updates"];
            if (!keywords.includes(val)) {
              entities.to = val;
              break;
            }
          }
        }
      }

      return {
        action: pattern.action,
        platform: pattern.platform,
        text,
        entities
      };
    }
  }

  // 2. Fallback
  return {
    action: "UNKNOWN",
    platform: "system",
    text,
    entities: { query: text }
  };
}


