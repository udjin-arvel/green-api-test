import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Plus, Send, LogOut, Users, Phone, Settings, Check } from "lucide-react";
import { checkAccount, checkState, receiveOne, sendMessage, type Creds } from "@/lib/greenapi";
import {
  applyIncomingMessage,
  formatPhoneLabel,
  isValidMaxPhone,
  makeMessageId,
  normalizePhoneInput,
  sanitizeStoredChats,
  type Chat,
  type Msg,
} from "@/lib/chat-utils";

export const Route = createFileRoute("/")({
  component: Index,
});

const KEY = "max-chat-creds";
const CHATS = "max-chat-chats";

function Index() {
  const [creds, setCreds] = useState<Creds | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const c = localStorage.getItem(KEY);
    if (c) setCreds(JSON.parse(c));
    setReady(true);
  }, []);
  if (!ready) return <div className="min-h-screen bg-background" />;
  if (!creds)
    return (
      <Login
        onLogin={(c) => {
          localStorage.setItem(KEY, JSON.stringify(c));
          setCreds(c);
        }}
      />
    );
  return (
    <ChatApp
      creds={creds}
      onLogout={() => {
        localStorage.removeItem(KEY);
        setCreds(null);
      }}
    />
  );
}

function Login({ onLogin }: { onLogin: (c: Creds) => void }) {
  const [f, setF] = useState<Creds>({ apiUrl: "https://api.green-api.com", idInstance: "", apiTokenInstance: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await checkState(f);
      if (!r.ok) setErr(r.error ?? "Не удалось войти");
      else if (r.state !== "authorized") setErr(`Инстанс не авторизован (состояние: ${r.state})`);
      else onLogin(f);
    } catch {
      setErr("Проверьте введённые данные");
    }
    setBusy(false);
  };
  const input = "w-full rounded-xl bg-input px-4 py-3 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="chat-canvas flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-card p-8 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <MessageCircle className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Вход</h1>
            <p className="text-sm text-muted-foreground">Данные инстанса GREEN-API</p>
          </div>
        </div>
        <input className={input} placeholder="idInstance" value={f.idInstance} onChange={(e) => setF({ ...f, idInstance: e.target.value.trim() })} required />
        <input className={input} placeholder="apiTokenInstance" type="password" value={f.apiTokenInstance} onChange={(e) => setF({ ...f, apiTokenInstance: e.target.value.trim() })} required />
        <input className={input} placeholder="apiUrl" value={f.apiUrl} onChange={(e) => setF({ ...f, apiUrl: e.target.value.trim() })} required />
        <p className="text-xs text-muted-foreground">
          Для приёма ответов в кабинете GREEN-API включите входящие уведомления и не задавайте URL вебхука (используется HTTP API).
        </p>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-primary py-3 font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
          {busy ? "Проверка…" : "Войти"}
        </button>
      </form>
    </div>
  );
}

const fmt = (ts: number) => new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

function ChatApp({ creds, onLogout }: { creds: Creds; onLogout: () => void }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [pollErr, setPollErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = localStorage.getItem(CHATS + creds.idInstance);
    if (c) setChats(sanitizeStoredChats(JSON.parse(c)));
  }, [creds.idInstance]);
  useEffect(() => {
    localStorage.setItem(CHATS + creds.idInstance, JSON.stringify(chats));
  }, [chats, creds.idInstance]);

  const addMsg = useCallback((chatId: string, m: Msg, meta?: { phone?: string; chatName?: string }) => {
    setChats((cs) => {
      const ex = cs.find((c) => c.chatId === chatId);
      if (ex) {
        if (ex.messages.some((x) => x.id === m.id)) return cs;
        return cs.map((c) =>
          c.chatId === chatId
            ? {
                ...c,
                chatName: meta?.chatName ?? c.chatName,
                messages: [...c.messages, m],
              }
            : c,
        );
      }
      const phone = meta?.phone ?? chatId;
      return [{ chatId, phone, chatName: meta?.chatName, messages: [m] }, ...cs];
    });
  }, []);

  // Polling incoming notifications
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      while (!cancelled) {
        try {
          const r = await receiveOne(creds);
          if (cancelled) break;
          if (r.error) setPollErr(r.error);
          else setPollErr((prev) => (prev ? "" : prev));
          if (r.msg) {
            setChats((cs) => applyIncomingMessage(cs, r.msg!));
          }
          if (!r.ok) await new Promise((res) => setTimeout(res, 5000));
          else if (!r.got) await new Promise((res) => setTimeout(res, 1000));
        } catch {
          if (!cancelled) await new Promise((res) => setTimeout(res, 5000));
        }
      }
    }

    void poll();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds]);

  const chat = chats.find((c) => c.chatId === active);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages.length]);

  const createChat = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const phone = normalizePhoneInput(newPhone);
    if (!isValidMaxPhone(phone)) {
      setErr("Введите номер РФ или РБ: 11 или 12 цифр (7… или 375…)");
      return;
    }
    setCreating(true);
    try {
      const r = await checkAccount({ ...creds, phoneNumber: phone });
      if (!r.ok) {
        setErr(r.error ?? "Не удалось проверить номер");
        return;
      }
      if (!r.exist || !r.chatId) {
        setErr("На этом номере нет аккаунта MAX");
        return;
      }
      const chatId = r.chatId;
      if (!chats.some((c) => c.chatId === chatId)) {
        setChats((cs) => [{ chatId, phone, messages: [] }, ...cs]);
      }
      setActive(chatId);
      setNewPhone("");
      setAdding(false);
    } catch {
      setErr("Не удалось проверить номер");
    } finally {
      setCreating(false);
    }
  };

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chat || !text.trim()) return;
    const msg = text.trim();
    setText("");
    setErr("");
    const r = await sendMessage({ ...creds, chatId: chat.chatId, message: msg });
    if (!r.ok) setErr(r.error ?? "Не удалось отправить");
    else addMsg(chat.chatId, { id: makeMessageId(r.idMessage), text: msg, ts: Date.now(), outgoing: true });
  };

  const displayName = (c: Chat) => {
    if (c.chatName) return c.chatName;
    const p = formatPhoneLabel(c.phone);
    return p ? `+${p}` : c.chatId;
  };

  const avatarLabel = (c: Chat) => {
    const p = formatPhoneLabel(c.phone);
    if (p.length >= 2) return p.slice(-2);
    return (c.chatName ?? c.chatId).slice(0, 2);
  };

  const rail = [
    { icon: MessageCircle, label: "Все", on: true },
    { icon: Users, label: "Контакты" },
    { icon: Phone, label: "Звонки" },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <nav className="flex w-[88px] flex-col items-center gap-6 bg-rail py-6">
        {rail.map((r) => (
          <div key={r.label} className={`flex flex-col items-center gap-1 text-xs ${r.on ? "text-foreground" : "text-muted-foreground"}`}>
            <r.icon className="h-6 w-6" />
            {r.label}
          </div>
        ))}
        <div className="flex-1" />
        <button onClick={onLogout} className="flex flex-col items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <LogOut className="h-6 w-6" />
          Выйти
        </button>
        <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
          <Settings className="h-6 w-6" />
          Настройки
        </div>
      </nav>

      <aside className="flex w-[360px] flex-col border-r border-border bg-background">
        <div className="flex items-center justify-between px-5 pb-3 pt-6">
          <h1 className="text-2xl font-bold">Чаты</h1>
          <button onClick={() => setAdding((a) => !a)} aria-label="Новый чат" className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90">
            <Plus className="h-6 w-6" />
          </button>
        </div>
        {adding && (
          <form onSubmit={createChat} className="space-y-2 px-5 pb-3">
            <div className="flex gap-2">
              <input
                autoFocus
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Номер, напр. 79001234567"
                className="flex-1 rounded-xl bg-input px-4 py-2.5 outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                disabled={creating}
              />
              <button disabled={creating} className="rounded-xl bg-primary px-4 font-medium text-primary-foreground disabled:opacity-50">
                {creating ? "…" : "OK"}
              </button>
            </div>
            {err && adding && <p className="text-sm text-destructive">{err}</p>}
          </form>
        )}
        {pollErr && <p className="px-5 pb-2 text-xs text-destructive">{pollErr}</p>}
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">Нажмите «+», чтобы начать чат по номеру телефона</p>}
          {chats.map((c) => {
            const last = c.messages[c.messages.length - 1];
            return (
              <button key={c.chatId} onClick={() => setActive(c.chatId)} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${active === c.chatId ? "bg-accent" : "hover:bg-accent/60"}`}>
                <div className="avatar-grad flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-medium text-primary-foreground">{avatarLabel(c)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-medium">{displayName(c)}</span>
                    {last && <span className="shrink-0 text-sm text-muted-foreground">{fmt(last.ts)}</span>}
                  </div>
                  <p className="truncate text-muted-foreground">{last ? last.text : "Нет сообщений"}</p>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="chat-canvas flex flex-1 flex-col">
        {chat ? (
          <>
            <header className="flex items-center gap-3 border-b border-border bg-card px-5 py-3">
              <div className="avatar-grad flex h-10 w-10 items-center justify-center rounded-full text-primary-foreground">{avatarLabel(chat)}</div>
              <div>
                <div className="font-medium">{displayName(chat)}</div>
                <div className="text-xs text-muted-foreground">MAX</div>
              </div>
            </header>
            <div className="flex-1 space-y-2 overflow-y-auto px-6 py-4">
              {chat.messages.map((m) => (
                <div key={m.id} className={`flex ${m.outgoing ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[65%] rounded-2xl px-4 py-2 ${m.outgoing ? "rounded-br-md bg-bubble-out text-primary-foreground" : "rounded-bl-md bg-bubble-in"}`}>
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] opacity-70">
                      {fmt(m.ts)} {m.outgoing && <Check className="h-3 w-3" />}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            {err && !adding && <p className="px-6 text-sm text-destructive">{err}</p>}
            <form onSubmit={onSend} className="flex gap-2 bg-card p-3">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Сообщение" className="flex-1 rounded-xl bg-input px-4 py-3 outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring" />
              <button aria-label="Отправить" className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90">
                <Send className="h-5 w-5" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <span className="rounded-full bg-card/80 px-4 py-2 text-sm text-muted-foreground">Выберите чат или создайте новый</span>
          </div>
        )}
      </main>
    </div>
  );
}
