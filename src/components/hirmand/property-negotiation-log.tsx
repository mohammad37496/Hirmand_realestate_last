import { useEffect, useMemo, useState } from "react";
import { Check, CircleDollarSign, Clock3, Plus, Trash2 } from "lucide-react";
import type { Property } from "@/lib/properties";
import { formatToman } from "@/lib/money";
import { formatPersianDate } from "@/lib/persian-date";
import { PersianDatePicker } from "./persian-date-picker";
import "@/property-negotiation-log.css";

const KEY_PREFIX = "hirmand-property-negotiation-log-v1:";
const STATUS = ["پیشنهاد اولیه", "پیگیری", "پاسخ مالک", "مذاکره نهایی", "پذیرفته شد", "رد شد"] as const;

type Entry = {
  id: string;
  date: string;
  offer: number;
  status: (typeof STATUS)[number];
  note: string;
};

function amount(value: string | null) {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function read(id: string): Entry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY_PREFIX + id);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((item): item is Entry => Boolean(item) && typeof item === "object" && typeof item.offer !== "undefined").slice(0, 40) : [];
  } catch {
    return [];
  }
}
function formatOffer(value: number) {
  return value > 0 ? formatToman(value) + " تومان" : "—";
}

export function PropertyNegotiationLog({ property }: { property: Property }) {
  const asking = amount(property.price);
  const [entries, setEntries] = useState<Entry[]>(() => read(property.id));
  const [offer, setOffer] = useState("");
  const [status, setStatus] = useState<(typeof STATUS)[number]>("پیشنهاد اولیه");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(KEY_PREFIX + property.id, JSON.stringify(entries));
    } catch {
      // Keep the log usable in memory when storage is unavailable.
    }
  }, [entries, property.id]);

  const latest = entries[entries.length - 1];
  const bestOffer = useMemo(() => entries.filter((item) => item.offer > 0).reduce((best, item) => Math.max(best, item.offer), 0), [entries]);
  const bestSaving = asking > 0 && bestOffer > 0 ? asking - bestOffer : 0;

  function addEntry() {
    const numeric = amount(offer);
    if (!numeric) return;
    setEntries((current) => [...current, {
      id: crypto.randomUUID(),
      date,
      offer: numeric,
      status,
      note: note.trim().slice(0, 600),
    }].slice(-40));
    setOffer("");
    setNote("");
  }

  function clearAll() {
    setEntries([]);
    try { localStorage.removeItem(KEY_PREFIX + property.id); } catch { /* ignore */ }
  }

  if (!asking && !entries.length) return null;

  return (
    <section className="property-negotiation-log" aria-labelledby="property-negotiation-log-title">
      <header className="property-negotiation-log-head">
        <div>
          <span className="kicker">سوابق مذاکره</span>
          <h2 id="property-negotiation-log-title"><CircleDollarSign size={19} /> تاریخچه پیشنهادهای قیمت</h2>
          <p>هر پیشنهاد، پاسخ و پیگیری را ثبت کنید تا روند مذاکره همین فایل از دست نرود. این دفتر فقط سابقه شخصی شماست و به‌معنای تعهد مالک نیست.</p>
        </div>
        {entries.length ? <button type="button" className="btn-ghost" onClick={clearAll}><Trash2 size={15} /> پاک‌کردن سابقه</button> : null}
      </header>

      {asking > 0 ? (
        <div className="property-negotiation-summary">
          <div><span>قیمت اعلامی</span><strong>{formatOffer(asking)}</strong></div>
          <div><span>بهترین پیشنهاد ثبت‌شده</span><strong>{bestOffer ? formatOffer(bestOffer) : "ثبت نشده"}</strong></div>
          <div><span>اختلاف با قیمت اعلامی</span><strong>{bestSaving > 0 ? formatOffer(bestSaving) : "—"}</strong></div>
        </div>
      ) : null}

      <div className="property-negotiation-form">
        <label><span>تاریخ</span><PersianDatePicker value={date} onChange={setDate} title="تاریخ پیشنهاد" hint="" /></label>
        <label><span>مبلغ پیشنهاد</span><input inputMode="numeric" value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="تومان" /></label>
        <label><span>وضعیت</span><select value={status} onChange={(e) => setStatus(e.target.value as (typeof STATUS)[number])}>{STATUS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="property-negotiation-note-field"><span>یادداشت</span><textarea rows={2} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً مالک گفت تا فردا پاسخ می‌دهد..." /></label>
        <button type="button" className="btn-gold" onClick={addEntry}><Plus size={15} /> ثبت پیشنهاد</button>
      </div>

      {entries.length ? (
        <div className="property-negotiation-timeline">
          {entries.slice().reverse().map((entry, index) => (
            <article key={entry.id} className="property-negotiation-entry">
              <div className="property-negotiation-entry-icon">{index === 0 ? <Check size={15} /> : <Clock3 size={15} />}</div>
              <div className="property-negotiation-entry-body">
                <div className="property-negotiation-entry-head"><strong>{formatOffer(entry.offer)}</strong><span>{entry.status}</span><time>{formatPersianDate(entry.date)}</time></div>
                {asking > 0 ? <small>{Math.max(0, ((asking - entry.offer) / asking) * 100).toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪ پایین‌تر از قیمت اعلامی</small> : null}
                {entry.note ? <p>{entry.note}</p> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="property-negotiation-empty">هنوز پیشنهادی ثبت نشده است.</p>
      )}
    </section>
  );
}
