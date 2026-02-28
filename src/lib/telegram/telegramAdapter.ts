// src/lib/telegram/telegramAdapter.ts

import { PlatformAdapter, ExecutionResult } from "@/lib/platforms/platformTypes";
import { ResolvedIntent } from "@/lib/govind/intentMap";
import { getTelegramClient } from "./telegramClient";
import { generateTelegramDraft } from "@/services/telegramDrafter";

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
            if (intent.text.includes("last message") || intent.text.includes("latest message") || intent.text.includes("read the message")) {
              const activeChatId = client.activeChatId || -1;
              if (activeChatId !== -1) {
                const messages = await client.getMessages(activeChatId, 10);
                if (messages.length > 0) {
                  // Find the last message from the OTHER person
                  const lastIncoming = messages.find(m => m.senderId !== 0);
                  const msg = lastIncoming || messages[0];
                  const senderName = msg.senderId === 0 ? "You" : (msg.senderName || "Unknown");

                  return {
                    success: true,
                    message: `The last message from ${senderName} says: ${msg.text}`,
                    data: { type: "READ_SINGLE", message: msg, chatId: activeChatId }
                  };
                }
              }
            }

            // 1b. If the user explicitly named someone, target that first
            let targetName = (intent.entities.to || "").toLowerCase();
            targetName = targetName.replace(/^(the group|the chat|the contact|group|chat|message from|messages from)\s+/i, "").trim();

            if (targetName) {
              const resolvedChat = chats.find(c =>
                (c.title || "").toLowerCase().includes(targetName) ||
                targetName.includes((c.title || "").toLowerCase())
              );

              if (resolvedChat) {
                const messages = await client.getMessages(resolvedChat.id, 5);
                if (messages.length === 0) {
                  return { success: true, message: `No messages found in your chat with ${resolvedChat.title}.` };
                }

                let spokenText = `In your chat with ${resolvedChat.title}, you have ${messages.length} messages. `;
                messages.slice(0, 3).forEach((msg, idx) => {
                  spokenText += `Message ${idx + 1} from ${msg.senderName || "Unknown"}: ${msg.text.substring(0, 100)}. `;
                });

                return {
                  success: true,
                  message: spokenText,
                  data: { messages, chatId: resolvedChat.id, type: "MESSAGES_LIST" }
                };
              }
            }

            // 1. If user didn't specify a chat (or resolution failed), and there are unread chats, list them.
            if (!targetName && unreadChats.length > 0) {
              const count = unreadChats.length;
              let spoken = `You have unread messages from ${count} contact${count > 1 ? 's' : ''}: `;
              spoken += unreadChats.map(c => `${c.title} (${c.unreadCount} new)`).join(", ") + ". ";
              spoken += "Which one would you like me to read?";

              return {
                success: true,
                message: spoken,
                data: { type: "CHATS_LIST", chats: unreadChats }
              };
            }

            if (unreadChats.length === 0 && !targetName) {
              return {
                success: true,
                message: "You have no unread Telegram messages at the moment."
              };
            }

            return {
              success: true,
              message: targetName
                ? `I couldn't find a group or chat named "${targetName}".`
                : "Who would you like to read messages from?"
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
            const toMatch = text.match(/(?:to|towards|for)\s+([a-z0-9_]+)|message\s+([a-z0-9_]+)|chat\s+with\s+([a-z0-9_]+)/i);
            const bodyMatch = text.match(/(?:message|body|say|saying|text|tell them)[\s:]+(.+)$/i);

            let recipient = toMatch ? (toMatch[1] || toMatch[2] || toMatch[3]) : intent.entities.to;
            const body = bodyMatch ? bodyMatch[1].trim() : intent.entities.body;

            // 2. Resolve Chat ID (Prioritize active context)
            let chatId = intent.entities.chatId ? parseInt(intent.entities.chatId) : (client.activeChatId || -1);
            const chats = await client.getChats();
            let resolvedChat = chats.find(c => c.id === chatId);

            // 3. Fallback to name-based resolution if no active chat or ID mismatch
            if ((chatId === -1 || !resolvedChat) && recipient) {
              let targetName = recipient.toLowerCase();
              targetName = targetName.replace(/^(the group|the chat|the contact|group|chat)\s+/i, "").trim();

              resolvedChat = chats.find(c =>
                (c.title || "").toLowerCase().includes(targetName) ||
                targetName.includes((c.title || "").toLowerCase()) ||
                (targetName.length > 3 && (c.title || "").toLowerCase().startsWith(targetName.substring(0, 4)))
              );
              if (resolvedChat) chatId = resolvedChat.id;
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

            const chatId = intent.entities.chatId ? parseInt(intent.entities.chatId) : (client.activeChatId || client.getDefaultChatId() || -1);
            const chats = await client.getChats();
            const resolvedChat = chats.find(c => c.id === chatId);

            if (!replyBody) {
              return {
                success: true,
                message: `What should I reply to ${resolvedChat?.title || "them"}?`,
                data: {
                  type: "OPEN_COMPOSE_REPLY",
                  to: resolvedChat?.title || "them",
                  chatId,
                  body: ""
                }
              };
            }

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

        case "REFRESH": {
          return {
            success: true,
            message: "Refreshing your Telegram chats.",
            data: { type: "REFRESH" }
          };
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
                message: "Opening Telegram Dashboard.",
                data: { type: "NAVIGATE_CHATS" }
              };
            }

            let targetName = (intent.entities.to || "").toLowerCase();
            // Clean up target name (strip common filler words used in voice)
            targetName = targetName.replace(/^(the group|the chat|the contact|group|chat|the conversation with)\s+/i, "").trim();

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
            let chatId = intent.entities.chatId ? parseInt(intent.entities.chatId) : (client.activeChatId || client.getDefaultChatId() || -1);

            // Fallback: If no active chat, try to find any chat with messages
            if (chatId === -1) {
              const chats = await client.getChats();
              const bestChat = chats.find(c => (c.unreadCount || 0) > 0) || chats[0];
              if (bestChat) chatId = bestChat.id;
            }

            if (chatId === -1) {
              return { success: false, message: "I don't see any active chats to summarize. Please open a chat first." };
            }

            const messages = await client.getMessages(chatId, 15);

            if (messages.length === 0) {
              return {
                success: true,
                message: "There are no recent messages in this chat to summarize.",
                data: { messages: [], chatId }
              };
            }

            return {
              success: true,
              message: "Analyzing the last few messages...",
              data: { messages, chatId, type: "SUMMARY_DATA" }
            };
          } catch (err: any) {
            return { success: false, message: "Failed to summarize messages.", error: err.message };
          }
        }

        case "DRAFT": {
          try {
            let chatId = intent.entities.chatId ? parseInt(intent.entities.chatId) : (client.activeChatId || client.getDefaultChatId() || -1);

            if (chatId === -1) {
              const chats = await client.getChats();
              const bestChat = chats.find(c => (c.unreadCount || 0) > 0) || chats[0];
              if (bestChat) chatId = bestChat.id;
            }

            const messages = await client.getMessages(chatId, 10);
            const chatName = intent.entities.to || (await client.getChats()).find(c => c.id === chatId)?.title || "them";

            if (messages.length === 0) {
              return { success: false, message: "I can't draft a reply without any conversation history. Please open a chat first." };
            }

            const draft = await generateTelegramDraft(messages, chatName);

            return {
              success: true,
              message: `I've drafted a reply for you.`,
              data: {
                type: "OPEN_COMPOSE_REPLY",
                to: chatName,
                chatId,
                body: draft.body,
                privacyInfo: draft.privacyInfo
              }
            };
          } catch (err: any) {
            console.error("[TG DRAFT ERROR]", err);
            const msg = (err.message?.includes("not found") || err.message?.includes("404"))
              ? "I couldn't find the AI models. Please enable 'Generative Language API' at: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com"
              : "Failed to generate AI suggestion.";
            return { success: false, message: msg };
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
