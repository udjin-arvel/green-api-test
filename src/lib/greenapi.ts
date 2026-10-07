import { z } from "zod";

const credsSchema = z.object({
  apiUrl: z.string().url(),
  idInstance: z.string().min(1).max(40),
  apiTokenInstance: z.string().min(1).max(200),
});

export type Creds = z.infer<typeof credsSchema>;

const phoneNumberSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(/\D/g, ""))
  .refine((p) => p.length === 11 || p.length === 12, "Номер: 11 или 12 цифр")
  .refine((p) => p.startsWith("7") || p.startsWith("375"), "Код страны: 7 или 375");

const checkAccountSchema = credsSchema.extend({ phoneNumber: phoneNumberSchema });

const sendMessageSchema = credsSchema.extend({
  chatId: z.string().min(1).max(60),
  message: z.string().min(1).max(4000),
});

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

function endpoint(c: Creds, method: string, suffix = ""): string {
  const root = c.apiUrl.replace(/\/+$/, "");
  const id = encodeURIComponent(c.idInstance);
  const token = encodeURIComponent(c.apiTokenInstance);
  return `${root}/waInstance${id}/${method}/${token}${suffix}`;
}

function trimError(text: string, max = 200): string {
  return text.slice(0, max);
}

async function postJson(c: Creds, method: string, body: unknown): Promise<Response> {
  return fetch(endpoint(c, method), {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export async function checkState(data: Creds) {
  const creds = credsSchema.parse(data);
  const r = await fetch(endpoint(creds, "getStateInstance"));
  if (!r.ok) return { ok: false as const, error: `Ошибка ${r.status}` };
  const j = (await r.json()) as { stateInstance?: string };
  return { ok: true as const, state: j.stateInstance ?? "unknown" };
}

export async function checkAccount(data: z.infer<typeof checkAccountSchema>) {
  const parsed = checkAccountSchema.parse(data);
  const r = await postJson(parsed, "checkAccount", { phoneNumber: Number(parsed.phoneNumber) });
  const txt = await r.text();
  if (!r.ok) return { ok: false as const, error: `Ошибка ${r.status}: ${trimError(txt)}` };

  const j = JSON.parse(txt) as {
    exist?: boolean;
    chatId?: string;
    status?: boolean;
    reason?: string;
  };
  if (j.status === false && j.reason) {
    return { ok: false as const, error: j.reason };
  }
  return { ok: true as const, exist: Boolean(j.exist), chatId: j.chatId ?? "" };
}

export async function sendMessage(data: z.infer<typeof sendMessageSchema>) {
  const parsed = sendMessageSchema.parse(data);
  const r = await postJson(parsed, "sendMessage", {
    chatId: parsed.chatId,
    message: parsed.message,
  });
  if (!r.ok) return { ok: false as const, error: `Ошибка ${r.status}: ${trimError(await r.text())}` };
  const j = (await r.json()) as { idMessage?: string };
  return { ok: true as const, idMessage: j.idMessage ?? "" };
}

export type IncomingPayload = {
  chatId: string;
  text: string;
  id: string;
  ts: number;
  outgoing: boolean;
  senderPhoneNumber?: number;
  chatName?: string;
} | null;

type ReceiveResult = { ok: boolean; got: boolean; msg: IncomingPayload; error?: string };

type WebhookBody = {
  typeWebhook?: string;
  timestamp?: number;
  idMessage?: string;
  senderData?: {
    chatId?: string;
    chatName?: string;
    senderPhoneNumber?: number;
  };
  messageData?: Record<string, unknown>;
};

function extractText(messageData: Record<string, unknown> | undefined): string | undefined {
  if (!messageData) return undefined;
  const plain = messageData.textMessageData as { textMessage?: string } | undefined;
  if (plain?.textMessage) return plain.textMessage;
  const extended = messageData.extendedTextMessageData as { text?: string } | undefined;
  return extended?.text;
}

function parseIncoming(body: WebhookBody, receiptId: number): IncomingPayload {
  const text = extractText(body.messageData);
  const isMessage =
    body.typeWebhook === "incomingMessageReceived" ||
    body.typeWebhook === "outgoingMessageReceived";
  if (!isMessage || !text) return null;

  const sender = body.senderData ?? {};
  return {
    chatId: sender.chatId ?? "",
    text,
    id: body.idMessage ?? String(receiptId),
    ts: (body.timestamp ?? Date.now() / 1000) * 1000,
    outgoing: body.typeWebhook === "outgoingMessageReceived",
    senderPhoneNumber:
      typeof sender.senderPhoneNumber === "number" ? sender.senderPhoneNumber : undefined,
    chatName: typeof sender.chatName === "string" ? sender.chatName : undefined,
  };
}

function receiveError(status: number, txt: string): string {
  if (txt.includes("webhook") || txt.toLowerCase().includes("webhookurl")) {
    return "В кабинете GREEN-API задан webhookUrl — для HTTP API очередь недоступна. Очистите URL вебхука и включите входящие уведомления.";
  }
  return `Ошибка ${status}: ${trimError(txt)}`;
}

export async function receiveOne(data: Creds): Promise<ReceiveResult> {
  const creds = credsSchema.parse(data);
  const r = await fetch(`${endpoint(creds, "receiveNotification")}?receiveTimeout=5`);
  const txt = await r.text();
  if (!r.ok) return { ok: false, got: false, msg: null, error: receiveError(r.status, txt) };
  if (!txt || txt === "null") return { ok: true, got: false, msg: null };

  const envelope = JSON.parse(txt) as { receiptId: number; body?: WebhookBody };
  await fetch(endpoint(creds, "deleteNotification", `/${envelope.receiptId}`), {
    method: "DELETE",
  });

  const msg = parseIncoming(envelope.body ?? {}, envelope.receiptId);
  return { ok: true, got: true, msg };
}
