import { MessageCircle, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import "@/customer-conversation.css";

type ChatMessage = {
  id: string;
  senderType: "customer" | "admin";
  senderName: string;
  message: string;
  createdAt: string;
};

type Props = {
  code: string;
  customerName?: string;
};

function faDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Tehran",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function CustomerConversation({ code, customerName = "" }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!code) return;
    setBusy(true);
    try {
      const response = await fetch("/api/customer-chat?code=" + encodeURIComponent(code), {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const data = await response.json().catch(() => null) as { messages?: ChatMessage[]; statusMessage?: string } | null;
      if (!response.ok) throw new Error(data?.statusMessage || "گفت‌وگو در دسترس نیست.");
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "دریافت پیام‌ها انجام نشد.");
    } finally {
      setBusy(false);
    }
  }, [code]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [code, load]);

  async function sendMessage() {
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/customer-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          code,
          name: customerName.trim() || "مشتری",
          message: clean,
        }),
      });
      const data = await response.json().catch(() => null) as { success?: boolean; message?: string; statusMessage?: string } | null;
      if (!response.ok || !data?.success) throw new Error(data?.statusMessage || data?.message || "ارسال پیام انجام نشد.");
      setText("");
      setMessage(data.message || "پیام ارسال شد.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ارسال پیام انجام نشد.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="customer-conversation" aria-labelledby="customer-conversation-title">
      <header className="customer-conversation-head">
        <div>
          <span className="kicker"><MessageCircle size={14} /> گفت‌وگوی مستقیم با مشاور</span>
          <h3 id="customer-conversation-title">سؤال یا توضیحی دارید؟ از همین‌جا پیام بفرستید.</h3>
          <p>پیام‌ها به همین کد رهگیری وصل می‌مانند و پاسخ مشاور را بعداً همین‌جا می‌بینید.</p>
        </div>
        <button type="button" className="btn-ghost customer-conversation-refresh" onClick={() => void load()} disabled={busy} aria-label="به‌روزرسانی پیام‌ها">
          <RefreshCw size={15} className={busy ? "customer-conversation-spin" : ""} />
          به‌روزرسانی
        </button>
      </header>

      <div className="customer-conversation-note">
        <ShieldCheck size={16} />
        فقط دارنده همین کد رهگیری به این گفت‌وگو دسترسی دارد.
      </div>

      <div className="customer-conversation-thread" aria-live="polite">
        {messages.length ? messages.map((item) => (
          <div key={item.id} className={"customer-chat-bubble " + (item.senderType === "admin" ? "is-admin" : "is-customer")}>
            <div className="customer-chat-meta">
              <strong>{item.senderType === "admin" ? item.senderName || "مشاور هیرمند" : "شما"}</strong>
              <time dateTime={item.createdAt}>{faDate(item.createdAt)}</time>
            </div>
            <p>{item.message}</p>
          </div>
        )) : (
          <div className="customer-conversation-empty">
            <MessageCircle size={22} />
            <strong>هنوز پیامی در این گفت‌وگو ثبت نشده است.</strong>
            <span>سؤال، شرایط معامله یا درخواست تماس را همین‌جا برای مشاور بنویسید.</span>
          </div>
        )}
      </div>

      <form className="customer-conversation-compose" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={1200}
          rows={3}
          placeholder="پیامتان را برای مشاور بنویسید…"
          aria-label="پیام برای مشاور"
          disabled={sending}
        />
        <div className="customer-conversation-compose-foot">
          <small>{text.length.toLocaleString("fa-IR")} / ۱۲۰۰</small>
          <button type="submit" className="btn-gold" disabled={sending || !text.trim()}>
            <Send size={16} />
            {sending ? "در حال ارسال…" : "ارسال پیام"}
          </button>
        </div>
      </form>

      {message ? <p className="customer-conversation-status" role="status">{message}</p> : null}
    </section>
  );
}
