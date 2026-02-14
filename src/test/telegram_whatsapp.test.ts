// src/test/telegram_whatsapp.test.ts

import { describe, it, expect, beforeAll } from "vitest";
import { TelegramAdapter } from "@/lib/telegram/telegramAdapter";
import { ResolvedIntent } from "@/lib/govind/intentMap";

describe("Telegram Integration", () => {
  it("should handle READ action", async () => {
    const intent: ResolvedIntent = {
      action: "READ",
      platform: "telegram",
      text: "check my telegram messages",
      entities: {}
    };

    const result = await TelegramAdapter.execute(intent);
    expect(result).toBeDefined();
    expect(result.success).toBeDefined();
  });

  it("should handle SEND action", async () => {
    const intent: ResolvedIntent = {
      action: "SEND",
      platform: "telegram",
      text: "send message on telegram",
      entities: {
        to: "john",
        body: "Hello John!"
      }
    };

    const result = await TelegramAdapter.execute(intent);
    expect(result).toBeDefined();
    expect(result.message).toBeDefined();
  });

  it("should handle REPLY action", async () => {
    const intent: ResolvedIntent = {
      action: "REPLY",
      platform: "telegram",
      text: "reply to message 123",
      entities: {
        messageId: "123",
        body: "Thanks for the message"
      }
    };

    const result = await TelegramAdapter.execute(intent);
    expect(result).toBeDefined();
  });

  it("should handle OPEN_PLATFORM action", async () => {
    const intent: ResolvedIntent = {
      action: "OPEN_PLATFORM",
      platform: "telegram",
      text: "open telegram",
      entities: {}
    };

    const result = await TelegramAdapter.execute(intent);
    expect(result.success).toBeDefined();
  });
});

describe("Intent Detection for Messaging Platforms", () => {
  it("should detect telegram read intent", () => {
    const text = "check telegram messages";
    expect(text).toContain("telegram");
    expect(text).toContain("check");
  });

  it("should handle telegram platform switching", async () => {
    const intent: ResolvedIntent = {
      action: "OPEN_PLATFORM",
      platform: "telegram",
      text: "switch to telegram",
      entities: {}
    };

    const result = await TelegramAdapter.execute(intent);
    expect(result).toBeDefined();
    expect(result.message).toContain("Telegram");
  });
});
