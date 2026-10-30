import { useState, type FormEvent } from "react";
import { Bot, Eraser, Send, Sparkles, UserRound } from "lucide-react";
import type { AdminRole } from "@/lib/admin-roles";
import { AdminErrorBanner } from "@/components/hirmand/admin-ui";
import "@/admin-ai-assistant.css";

type Message = { role: "user" | "assistant"; content: string };
const SUGGESTIONS = [
  "وضعیت کلی کسب‌وکار در ۳۰ روز اخیر چگونه بوده؟",
  "کدام کارهای CRM باید زودتر پیگیری شوند؟",
  "عملکرد معاملات و مشاوران را تحلیل کن.",
  "برای بهتر شدن نرخ تبدیل مشتری به معامله چه اقدامی پیشنهاد می‌کنی؟",
];

export function AdminAiAssistant({ role }: { role: AdminRole }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  if (role !== "owner" && role !== "manager" && role !== "sales") return null;

  async function sendMessage(event?: FormEvent<HTMLFormElement>, suggested?: string) {
    event?.preventDefault();
    const content = (suggested ?? draft).trim();
    if (!content || sending) return;
    const history = [...messages, { role: "user" as const, content }].slice(-4);
    setMessages(history);
    setDraft("");
    setError("");
    setSending(true);
    try {
      const response = await fetch("/api/admin-assistant", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const payload = await response.json().catch(() => ({})) as { answer?: string; statusMessage?: string };
      if (!response.ok || !payload.answer) throw new Error(payload.statusMessage || "پاسخ دستیار دریافت نشد.");
      const reply: Message = { role: "assistant", content: payload.answer };
      setMessages([...history, reply].slice(-4));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "پاسخ دستیار دریافت نشد.");
    } finally {
      setSending(false);
    }
  }

  return <section className="admin-ai-assistant" dir="rtl" aria-labelledby="admin-ai-title">
    <header className="admin-ai-head">
      <div className="admin-ai-mark"><Sparkles size={19} /></div>
      <div>
        <span className="kicker">همراه هوشمند هیرمند</span>
        <h2 id="admin-ai-title">دستیار مدیر و مشاوران</h2>
        <p>پرسش فارسی درباره عملکرد، معاملات و پیگیری‌ها؛ پاسخ بر اساس آمار واقعی ۳۰ روز اخیر</p>
      </div>
      <button type="button" className="admin-ai-clear" onClick={() => { setMessages([]); setError(""); }} disabled={!messages.length || sending}>
        <Eraser size={15} /> پاک‌کردن گفتگو
      </button>
    </header>

    <div className="admin-ai-context"><span><Bot size={14} /> متن پرسش به OpenAI ارسال می‌شود؛ نام یا شماره تماس مشتری را داخل پرسش ننویسید. آمار گزارش تجمیعی است.</span><span>۸ درخواست در هر ۱۰ دقیقه برای هر نشست</span></div>

    <div className="admin-ai-thread" aria-live="polite" aria-relevant="additions text">
      {!messages.length ? <div className="admin-ai-welcome">
        <strong>امروز چه چیزی را بررسی کنیم؟</strong>
        <p>می‌توانی درباره وضعیت فایل‌ها، مشتریان، معاملات، کمیسیون و اولویت پیگیری‌ها سؤال کنی.</p>
        <div className="admin-ai-suggestions">{SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => void sendMessage(undefined, suggestion)} disabled={sending}>{suggestion}</button>)}</div>
      </div> : messages.map((message, index) => <article className={`admin-ai-message ${message.role}`} key={`${message.role}-${index}`}>
        <span className="admin-ai-avatar">{message.role === "assistant" ? <Bot size={16} /> : <UserRound size={16} />}</span>
        <div><small>{message.role === "assistant" ? "دستیار هیرمند" : "شما"}</small><p>{message.content}</p></div>
      </article>)}
      {sending ? <div className="admin-ai-thinking"><span className="admin-ai-dots" /> در حال تحلیل اطلاعات…</div> : null}
    </div>

    {error ? <AdminErrorBanner message={error} onDismiss={() => setError("")} /> : null}
    <form className="admin-ai-composer" onSubmit={(event) => void sendMessage(event)}>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1200} rows={2} placeholder="مثلاً چرا تعداد پیگیری‌های عقب‌افتاده زیاد شده؟" aria-label="پیام به دستیار هوشمند" disabled={sending} />
      <div><small>{draft.length.toLocaleString("fa-IR")} / ۱۲۰۰</small><button type="submit" className="btn-gold" disabled={sending || !draft.trim()}><Send size={15} /> {sending ? "در حال پاسخ…" : "ارسال پرسش"}</button></div>
    </form>
  </section>;
}
