export type Msg = { id: string; text: string; ts: number; outgoing: boolean };
export type Chat = { chatId: string; phone: string; chatName?: string; messages: Msg[] };

/** Digits only; empty if nothing valid. */
export function normalizePhoneInput(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidMaxPhone(phone: string): boolean {
  if (phone.length !== 11 && phone.length !== 12) return false;
  return phone.startsWith("7") || phone.startsWith("375");
}

export function formatPhoneLabel(phone: string): string {
  return phone.startsWith("+") ? phone.slice(1) : phone;
}

/** Works on http (non-localhost), unlike crypto.randomUUID in insecure contexts. */
export function makeMessageId(serverId?: string): string {
  if (serverId) return serverId;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      /* secure context required in some browsers */
    }
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Drop legacy WhatsApp-style chat ids stored before MAX CheckAccount flow. */
export function sanitizeStoredChats(raw: unknown): Chat[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is Chat => {
    if (!c || typeof c !== "object") return false;
    const chat = c as Chat;
    return typeof chat.chatId === "string" && !chat.chatId.includes("@c.us") && typeof chat.phone === "string";
  });
}

export type IncomingMsg = {
  chatId: string;
  text: string;
  id: string;
  ts: number;
  outgoing: boolean;
  senderPhoneNumber?: number;
  chatName?: string;
};

export function phoneFromSender(senderPhoneNumber?: number): string | undefined {
  if (senderPhoneNumber == null || senderPhoneNumber === 0) return undefined;
  return String(senderPhoneNumber);
}

export function applyIncomingMessage(chats: Chat[], incoming: IncomingMsg): Chat[] {
  const { chatId } = incoming;
  if (!chatId) return chats;

  const msg: Msg = {
    id: incoming.id,
    text: incoming.text,
    ts: incoming.ts,
    outgoing: incoming.outgoing,
  };

  const existing = chats.find((c) => c.chatId === chatId);
  if (existing) {
    if (existing.messages.some((x) => x.id === msg.id)) return chats;
    return chats.map((c) =>
      c.chatId === chatId
        ? {
            ...c,
            chatName: incoming.chatName ?? c.chatName,
            messages: [...c.messages, msg],
          }
        : c,
    );
  }

  const fromSender = phoneFromSender(incoming.senderPhoneNumber);
  const phone = fromSender ?? chatId;
  return [{ chatId, phone, chatName: incoming.chatName, messages: [msg] }, ...chats];
}
