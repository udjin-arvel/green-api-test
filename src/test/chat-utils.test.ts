import { describe, expect, it } from "vitest";

import {
  applyIncomingMessage,
  isValidMaxPhone,
  makeMessageId,
  normalizePhoneInput,
  sanitizeStoredChats,
} from "@/lib/chat-utils";

describe("makeMessageId", () => {
  it("uses server id when provided", () => {
    expect(makeMessageId("1763115112345")).toBe("1763115112345");
  });

  it("generates id without server id", () => {
    const id = makeMessageId();
    expect(id.length).toBeGreaterThan(8);
  });
});

describe("normalizePhoneInput", () => {
  it("strips non-digits", () => {
    expect(normalizePhoneInput("+7 (900) 123-45-67")).toBe("79001234567");
  });
});

describe("isValidMaxPhone", () => {
  it("accepts RU 11-digit numbers", () => {
    expect(isValidMaxPhone("79001234567")).toBe(true);
  });

  it("accepts BY 12-digit numbers", () => {
    expect(isValidMaxPhone("375291234567")).toBe(true);
  });

  it("rejects too short numbers", () => {
    expect(isValidMaxPhone("7900123")).toBe(false);
  });
});

describe("sanitizeStoredChats", () => {
  it("drops legacy @c.us chat ids", () => {
    const result = sanitizeStoredChats([
      { chatId: "79001234567@c.us", phone: "79001234567", messages: [] },
      { chatId: "10000000", phone: "79001234567", messages: [] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.chatId).toBe("10000000");
  });
});

describe("applyIncomingMessage", () => {
  it("appends reply to existing chat by numeric chatId", () => {
    const chats = [{ chatId: "10000000", phone: "79001234567", messages: [] }];
    const next = applyIncomingMessage(chats, {
      chatId: "10000000",
      id: "msg-1",
      text: "Привет",
      ts: 1000,
      outgoing: false,
    });
    expect(next[0]?.messages).toHaveLength(1);
    expect(next[0]?.messages[0]?.text).toBe("Привет");
  });

  it("does not duplicate messages with the same id", () => {
    const chats = [
      {
        chatId: "10000000",
        phone: "79001234567",
        messages: [{ id: "msg-1", text: "Привет", ts: 1000, outgoing: false }],
      },
    ];
    const next = applyIncomingMessage(chats, {
      chatId: "10000000",
      id: "msg-1",
      text: "Привет",
      ts: 1000,
      outgoing: false,
    });
    expect(next[0]?.messages).toHaveLength(1);
  });

  it("creates chat from incoming with sender phone", () => {
    const next = applyIncomingMessage([], {
      chatId: "10000000",
      id: "msg-2",
      text: "Ответ",
      ts: 2000,
      outgoing: false,
      senderPhoneNumber: 79876543210,
    });
    expect(next).toHaveLength(1);
    expect(next[0]?.phone).toBe("79876543210");
    expect(next[0]?.chatId).toBe("10000000");
  });
});
