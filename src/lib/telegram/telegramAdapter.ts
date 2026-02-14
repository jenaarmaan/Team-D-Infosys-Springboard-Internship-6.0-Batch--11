// src/lib/telegram/telegramAdapter.ts

import { PlatformAdapter, ExecutionResult } from "@/lib/platforms/platformTypes";
import { ResolvedIntent } from "@/lib/govind/intentMap";
import { getTelegramClient } from "./telegramClient";

/**
 * Telegram Platform Adapter
 * Implements voice-based messaging for Telegram
 */
export const TelegramAdapter: PlatformAdapter = {
  id: "telegram",
  name: "Telegram Messenger",

  execute: async (intent: ResolvedIntent): Promise<ExecutionResult> => {
    const text = intent.text.toLowerCase();

    try {
      // Initialize Telegram client
      const client = getTelegramClient();

      if (!client) {
        return {
          success: false,
          message: "Telegram client is not initialized. Please ensure your configuration is correct.",
          error: "TELEGRAM_UNINITIALIZED"
        };
      }

      if (!client.isConnectedStatus()) {
        return {
          success: false,
          message: "Telegram is not connected. Please authenticate first.",
          error: "TELEGRAM_NOT_CONNECTED"
        };
      }

      switch (intent.action) {
        case "READ": {
          // Read recent messages
          try {
            const chats = await client.getChats();
            const unreadChats = chats.filter(c => (c.unreadCount || 0) > 0);

            // 1a. "Read my last message" logic (Specific request inside chat)
            if (intent.text.includes("last message") || intent.text.includes("latest message")) {
              const activeChatId = client.activeChatId || -1;
              if (activeChatId !== -1) {
                const messages = await client.getMessages(activeChatId, 10);
                if (messages.length > 0) {
                  // Find the last message from the OTHER person
                  const lastIncoming = messages.find(m => m.senderId !== 0);
                  const msg = lastIncoming || messages[0];

                  return {
                    success: true,
                    message: `The last message from ${msg.senderName} says: ${msg.text}`,
                    data: { type: "READ_SINGLE", message: msg }
                  };
                }
              }
            }

            // 1. If user didn't specify a chat, and there are unread chats, list them.
            if (!intent.entities.to && unreadChats.length > 0) {
              let spoken = `You have unread messages from ${unreadChats.length} contacts: `;
              spoken += unreadChats.map(c => `${c.title} (${c.unreadCount} new)`).join(", ") + ". ";
              spoken += "Which one would you like me to read?";

              return {
                success: true,
                message: spoken,
                data: { type: "CHATS_LIST", chats: unreadChats }
              };
            }

            // 2. Identify the target chat
            let targetName = (intent.entities.to || "").toLowerCase();
            // Clean up target name (strip common filler words used in voice)
            targetName = targetName.replace(/^(the group|the chat|the contact|group|chat)\s+/i, "").trim();

            const resolvedChat = chats.find(c =>
              (c.title || "").toLowerCase().includes(targetName) ||
              targetName.includes((c.title || "").toLowerCase())
            );
            const chatId = resolvedChat ? resolvedChat.id : (client.getDefaultChatId() || -1);

            if (chatId === -1 || (!resolvedChat && targetName)) {
              return {
                success: true,
                message: targetName
                  ? `I couldn't find a group or chat named "${targetName}". Please try again.`
                  : "Which chat would you like to read messages from? Please specify a contact or chat name."
              };
            }

            const messages = await client.getMessages(chatId, 5);

            if (messages.length === 0) {
              return {
                success: true,
                message: `No messages found in chat with ${resolvedChat?.title || "this contact"}.`
              };
            }

            // Format messages for voice
            let spokenText = `In your chat with ${resolvedChat?.title || "them"}, you have ${messages.length} messages. `;
            messages.slice(0, 3).forEach((msg, idx) => {
              spokenText += `Message ${idx + 1} from ${msg.senderName || "Unknown"}: ${msg.text.substring(0, 100)}. `;
            });

            return {
              success: true,
              message: spokenText,
              data: { messages, chatId, type: "MESSAGES_LIST" }
            };
          } catch (err: any) {
            return {
              success: false,
              message: "Failed to read Telegram messages",
              error: err.message
            };
          }
        }

        case "SEND": {
          // Send a new message
          try {
            // 1. Resolve Recipient & Body from Text
            const toMatch = text.match(/(?:to|towards|for)\s+([a-z0-9_]+)|message\s+([a-z0-9_]+)/i);
            const bodyMatch = text.match(/(?:message|body|say|saying|text|tell them)[\s:]+(.+)$/i);

            let recipient = toMatch ? (toMatch[1] || toMatch[2]) : intent.entities.to;
            const body = bodyMatch ? bodyMatch[1].trim() : intent.entities.body;

            // 2. Resolve Chat ID (Prioritize active context)
            let chatId = intent.entities.chatId ? parseInt(intent.entities.chatId) : -1;
            const chats = await client.getChats();
            let resolvedChat = chats.find(c => c.id === chatId);

            // 3. Fallback to name-based resolution if no active chat
            if (chatId === -1 && recipient) {
              let targetName = recipient.toLowerCase();
              targetName = targetName.replace(/^(the group|the chat|the contact|group|chat)\s+/i, "").trim();

              resolvedChat = chats.find(c =>
                (c.title || "").toLowerCase().includes(targetName) ||
                targetName.includes((c.title || "").toLowerCase()) ||
                (targetName.length > 3 && (c.title || "").toLowerCase().startsWith(targetName.substring(0, 4)))
              );
              chatId = resolvedChat ? resolvedChat.id : -1;
            }

            // 4. Handle Cases
            if (chatId === -1 && !recipient) {
              // Initiate multi-turn recipient capture
              return {
                success: true,
                message: "Who would you like to message on Telegram?",
                data: {
                  type: "OPEN_COMPOSE_REPLY",
                  to: "",
                  body: body || ""
                }
              };
            }

            if (chatId === -1 && recipient) {
              return {
                success: false,
                message: `I couldn't find a Telegram contact or group named "${recipient}".`,
                error: "CONTACT_NOT_FOUND"
              };
            }

            // If we have a recipient but NO body, we trigger a prompt
            const confirmedRecipient = resolvedChat?.title || recipient || "them";

            return {
              success: true,
              message: body
                ? `Prepared your message to ${confirmedRecipient}.`
                : `Alright, opening chat with ${confirmedRecipient}. What is your message?`,
              data: {
                type: "OPEN_COMPOSE_REPLY",
                to: confirmedRecipient,
                chatId,
                body: body || "" // Empty body triggers prompt in GovindContext
              }
            };
          } catch (err: any) {
            return { success: false, message: "Failed to process send request.", error: err.message };
          }
        }

        case "REPLY": {
          // Reply to a message
          try {
            const messageIdMatch = text.match(/message[\s:]*(\d+)|reply.*?id[\s:]*(\d+)/i);
            const bodyMatch = text.match(/with:\s*(.+?)(?:\.|$)|say:\s*(.+?)(?:\.|$)|reply:\s*(.+?)(?:\.|$)/i);

            const messageId = messageIdMatch ? parseInt(messageIdMatch[1] || messageIdMatch[2]) : -1;
            const replyBody = bodyMatch ? (bodyMatch[1] || bodyMatch[2] || bodyMatch[3]) : intent.entities.body;

            const chatId = intent.entities.chatId ? parseInt(intent.entities.chatId) : (client.getDefaultChatId() || -1);
            const chats = await client.getChats();
            const resolvedChat = chats.find(c => c.id === chatId);
            if (messageId === -1 || !replyBody) {
              return {
                success: false,
                message: "Please specify which message to reply to and what you want to say.",
                error: "MISSING_FIELDS"
              };
            }

            // const result = await client.replyToMessage(chatId, messageId, replyBody);

            // Trigger voice flow for reply
            return {
              success: true,
              message: `Ready to reply to that message.`,
              data: {
                type: "OPEN_COMPOSE_REPLY",
                to: resolvedChat?.title || "them",
                chatId,
                body: replyBody
              }
            };
          } catch (err: any) {
            return {
              success: false,
              message: "Failed to reply to message",
              error: err.message
            };
          }
        }

        case "VIEW_FOLDER": {
          return {
            success: true,
            message: "Opening your Telegram chat list.",
            data: { type: "NAVIGATE_CHATS" }
          };
        }

        case "OPEN_PLATFORM": {
          // Open/Connect to Telegram or specific chat
          try {
            if (!client.isConnectedStatus()) {
              return {
                success: true,
                message: "Opening Telegram Dashboard. Please note that you need to be authenticated via environment variables.",
                data: { type: "NAVIGATE_CHATS" }
              };
            }

            let targetName = (intent.entities.to || "").toLowerCase();
            // Clean up target name (strip common filler words used in voice)
            targetName = targetName.replace(/^(the group|the chat|the contact|group|chat)\s+/i, "").trim();

            if (targetName) {
              const chats = await client.getChats();
              const resolvedChat = chats.find(c =>
                (c.title || "").toLowerCase().includes(targetName) ||
                targetName.includes((c.title || "").toLowerCase())
              );

              if (resolvedChat) {
                return {
                  success: true,
                  message: `Opening chat with ${resolvedChat.title}.`,
                  data: { type: "NAVIGATE_CHAT", chatId: resolvedChat.id, path: "/telegram" }
                };
              } else {
                return {
                  success: false,
                  message: `I couldn't find a group or chat named "${targetName}".`,
                  error: "CHAT_NOT_FOUND"
                };
              }
            }

            return {
              success: true,
              message: "Opening Telegram Dashboard.",
              data: { type: "NAVIGATE_CHATS" }
            };
          } catch (err: any) {
            return {
              success: false,
              message: "Failed to open Telegram",
              error: err.message
            };
          }
        }

        case "SUMMARIZE": {
          try {
            const chatId = intent.entities.chatId ? parseInt(intent.entities.chatId) : (client.getDefaultChatId() || -1);
            // User requested: "recent 5-10 messages"
            const messages = await client.getMessages(chatId, 10);

            if (messages.length === 0) {
              return {
                success: true,
                message: "You have no recent messages to summarize.",
                data: { messages: [], chatId }
              };
            }

            return {
              success: true,
              message: "Analyzing the last messages...",
              data: { messages, chatId, type: "SUMMARY_DATA" }
            };
          } catch (err: any) {
            return {
              success: false,
              message: "Failed to summarize Telegram messages",
              error: err.message
            };
          }
        }

        case "DRAFT": {
          try {
            const chatId = intent.entities.chatId ? parseInt(intent.entities.chatId) : (client.getDefaultChatId() || -1);
            const messages = await client.getMessages(chatId, 5);
            const chatName = intent.entities.to || "them";

            // In real implementation, this would call generateEmailDraft or similar
            const draftBody = messages.length > 0
              ? `I've analyzed the recent activity with ${chatName}. I suggest saying: "I've received your updates and will follow up shortly."`
              : "I suggest a polite greeting: 'Hello! How can I help you today?'";

            return {
              success: true,
              message: "I've drafted a suggestion for you. Should I read it or send it?",
              data: {
                type: "OPEN_COMPOSE_REPLY",
                to: chatName,
                chatId,
                body: draftBody.replace("I suggest saying: ", "").replace("I suggest a polite greeting: ", "").replace(/"/g, "")
              }
            };
          } catch (err: any) {
            return { success: false, message: "Failed to draft suggestion." };
          }
        }

        case "CLOSE_CHAT":
          return {
            success: true,
            message: "Closing the chat and returning to the conversation list.",
            data: { type: "CLOSE_CHAT_UI" }
          };

        default: {
          return {
            success: false,
            message: `Action "${intent.action}" not supported on Telegram yet.`,
            error: "ACTION_NOT_SUPPORTED"
          };
        }
      }
    } catch (err: any) {
      return {
        success: false,
        message: "An error occurred while processing your Telegram request",
        error: err?.message || "UNKNOWN_ERROR"
      };
    }
  }
};
