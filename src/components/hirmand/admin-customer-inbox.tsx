import { MessageCircle, RefreshCw, Send, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "@/admin-customer-inbox.css";

type Conversation = {
  trackingCode: string;
  lastMessageAt: string;
  messageCount: number;
  unreadCount: number;
  customerName: string;
  customerPhone: string;
  consultant: string;
  deal: string;
  lastMessage?: string;
};

type Message = {
  id: string;
  trackingCode: string;
  senderType: "customer" | "admin";
  senderName: string;
  message: string;
  createdAt: string;
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

export function AdminCustomerInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function loadConversations() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin-customer-chat", { credentials: "same-origin" });
      const data = await response.json().catch(() => null) as { conversations?: Conversation[]; statusMessage?: string } | null;
      if (!response.ok) throw new Error(data?.statusMessage || "صندوق گفت‌وگو در دسترس نیست.");
      setConversations(Array.isArray(data?.conversations) ? data.conversations : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "دریافت گفت‌وگوها انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function loadThread(code: string) {
    setSelectedCode(code);
    try {
      const response = await fetch("/api/admin-customer-chat?code=" + encodeURIComponent(code), { credentials: "same-origin" });
      const data = await response.json().catch(() => null) as { conversations?: Message[]; statusMessage?: string } | null;
      if (!response.ok) throw new Error(data?.statusMessage || "گفت‌وگو پیدا نشد.");
      setMessages(Array.isArray(data?.conversations) ? data.conversations : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "دریافت پیام‌ها انجام نشد.");
    }
  }

  useEffect(() => {
    void loadConversations();
    const timer = window.setInterval(() => void loadConversations(), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedCode) return;
    void loadThread(selectedCode);
  }, [selectedCode]);

  const selected = useMemo(
    () => conversations.find((item) => item.trackingCode === selectedCode) ?? null,
    [conversations, selectedCode],
  );

  async function sendReply() {
    if (!selectedCode || !reply.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/admin-customer-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ code: selectedCode, message: reply.trim(), consultant: "هیرمند" }),
      });
      const data = await response.json().catch(() => null) as { success?: boolean; statusMessage?: string; message?: string } | null;
      if (!response.ok || !data?.success) throw new Error(data?.statusMessage || data?.message || "ارسال پاسخ انجام نشد.");
      setReply("");
      await Promise.all([loadThread(selectedCode), loadConversations()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ارسال پاسخ انجام نشد.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="admin-customer-inbox">
      <header className="admin-customer-inbox-head">
        <div>
          <span className="admin-kicker"><MessageCircle size={14} /> ارتباط مشتری</span>
          <h2>صندوق گفت‌وگوی آنلاین</h2>
          <p>پاسخ‌ها به همان کد رهگیری متصل هستند و مشتری آن‌ها را در صفحه پیگیری می‌بیند.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void loadConversations()} disabled={busy}>
          <RefreshCw size={15} /> به‌روزرسانی
        </button>
      </header>

      {error ? <div className="admin-customer-inbox-error" role="alert">{error}</div> : null}

      <div className="admin-customer-inbox-layout">
        <aside className="admin-customer-conversation-list" aria-label="گفت‌وگوهای مشتری">
          {conversations.length ? conversations.map((item) => (
            <button
              type="button"
              key={item.trackingCode}
              className={"admin-customer-conversation-item" + (item.trackingCode === selectedCode ? " is-active" : "")}
              onClick={() => setSelectedCode(item.trackingCode)}
            >
              <span className="admin-customer-avatar"><UserRound size={16} /></span>
              <span className="admin-customer-conversation-main">
                <strong>{item.customerName || "مشتری"}</strong>
                <small dir="ltr">{item.trackingCode}</small>
                <em>{item.lastMessage || "گفت‌وگوی جدید"}</em>
              </span>
              <span className="admin-customer-conversation-meta">
                {item.unreadCount > 0 ? <b>{item.unreadCount.toLocaleString("fa-IR")}</b> : null}
                <small>{faDate(item.lastMessageAt)}</small>
              </span>
            </button>
          )) : (
            <div className="admin-customer-inbox-empty"><MessageCircle size={26} /><strong>هنوز گفت‌وگویی ثبت نشده است.</strong></div>
          )}
        </aside>

        <div className="admin-customer-thread">
          {selected ? (
            <>
              <header className="admin-customer-thread-head">
                <div>
                  <strong>{selected.customerName || "مشتری"}</strong>
                  <span>{selected.customerPhone || "شماره ثبت نشده"} · {selected.deal || "درخواست ملکی"}</span>
                </div>
                <code dir="ltr">{selected.trackingCode}</code>
              </header>
              <div className="admin-customer-thread-messages">
                {messages.map((item) => (
                  <article key={item.id} className={"admin-customer-message " + (item.senderType === "customer" ? "is-customer" : "is-admin")}>
                    <div><strong>{item.senderType === "customer" ? item.senderName || "مشتری" : item.senderName || "هیرمند"}</strong><time>{faDate(item.createdAt)}</time></div>
                    <p>{item.message}</p>
                  </article>
                ))}
              </div>
              <form className="admin-customer-reply" onSubmit={(event) => { event.preventDefault(); void sendReply(); }}>
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  maxLength={1200}
                  rows={3}
                  placeholder="پاسخ مشاور را بنویسید…"
                  disabled={sending}
                />
                <button type="submit" className="btn-gold" disabled={sending || !reply.trim()}>
                  <Send size={16} /> {sending ? "در حال ارسال…" : "ارسال پاسخ"}
                </button>
              </form>
            </>
          ) : (
            <div className="admin-customer-inbox-empty"><MessageCircle size={32} /><strong>یک گفت‌وگو را انتخاب کنید.</strong><span>پیام‌های جدید مشتری‌ها را از ستون سمت راست باز کنید.</span></div>
          )}
        </div>
      </div>
    </section>
  );
}
