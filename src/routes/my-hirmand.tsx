import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, Clock3, Copy, History, Home, RefreshCw, Trash2, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { OwnerPropertyStatus } from "@/components/hirmand/owner-property-status";
import { SITE } from "@/lib/site";
import { clearCustomerTrackingCodes, forgetCustomerTrackingCode, normalizeCustomerTrackingCode, readCustomerTrackingCodes, rememberCustomerTrackingCode, type CustomerTrackingSummary } from "@/lib/customer-tracking";
import "@/my-hirmand.css";

type TrackingTimelineItem = { type: "created" | "status" | "visit"; label: string; note: string; at: string | null };
type TrackingResult = {
  trackingCode: string; status: string; statusLabel: string; visitStatus: string; visitStatusLabel: string;
  createdAt: string | null; updatedAt: string | null; consultant: string; deal: string; propertyType: string;
  neighborhood: string; visitRequestedAt: string | null; visitPreferredAt: string | null;
  property: { title: string; slug: string } | null; timeline: TrackingTimelineItem[];
};

function faDate(value: string | null) {
  if (!value) return "—";
  try { return new Intl.DateTimeFormat("fa-IR", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", timeZone:"Asia/Tehran" }).format(new Date(value)); }
  catch { return value; }
}

function CustomerRequestCard({ item, result, busy, onRemove, onCopy }: { item: CustomerTrackingSummary; result: TrackingResult | null; busy: boolean; onRemove: () => void; onCopy: () => void }) {
  return (
    <article className="my-hirmand-request-card">
      <div className="my-hirmand-request-head">
        <div className="my-hirmand-request-code" dir="ltr"><Clock3 size={16} />{item.trackingCode}</div>
        <div className="my-hirmand-request-actions">
          <button type="button" className="btn-ghost" onClick={onCopy}><Copy size={14} /> کپی</button>
          <button type="button" className="btn-ghost" onClick={onRemove}><Trash2 size={14} /> حذف</button>
        </div>
      </div>
      {busy ? (
        <div className="my-hirmand-loading"><RefreshCw size={20} className="my-hirmand-spin" /><span>در حال دریافت آخرین وضعیت…</span></div>
      ) : result ? (
        <>
          <div className="my-hirmand-status-row">
            <div><span className="kicker">وضعیت درخواست</span><strong>{result.statusLabel}</strong><small>آخرین بروزرسانی: {faDate(result.updatedAt || result.createdAt)}</small></div>
            <span className="my-hirmand-status-pill">{result.visitStatusLabel}</span>
          </div>
          <div className="my-hirmand-facts">
            <div><UserRound size={15} /><span>مشاور</span><strong>{result.consultant || "در حال تخصیص"}</strong></div>
            <div><Home size={15} /><span>نوع درخواست</span><strong>{result.deal || result.propertyType || "درخواست ملکی"}</strong></div>
            <div><span>محله</span><strong>{result.neighborhood || "ثبت نشده"}</strong></div>
            <div><CalendarDays size={15} /><span>ثبت</span><strong>{faDate(result.createdAt)}</strong></div>
          </div>
          {result.property ? <div className="my-hirmand-linked-property"><div><span className="kicker">فایل مرتبط</span><strong>{result.property.title}</strong><small>{result.neighborhood || "اصفهان"}</small></div><Link className="btn-gold" to="/properties/$slug" params={{ slug: result.property.slug }}>مشاهده فایل</Link></div> : null}
          {result.timeline.length ? <div className="my-hirmand-timeline"><div className="my-hirmand-timeline-head"><span className="kicker">تاریخچه</span><strong>آخرین رویدادها</strong></div><div className="my-hirmand-timeline-list">
            {result.timeline.slice(-6).reverse().map((event, index) => <div className="my-hirmand-timeline-item" key={event.type + "-" + (event.at || "na") + "-" + index}><span className="my-hirmand-timeline-dot">{event.type === "visit" ? <CalendarDays size={12} /> : <CheckCircle2 size={12} />}</span><div><strong>{event.label}</strong><small>{event.note}</small><time>{faDate(event.at)}</time></div></div>)}
          </div></div> : null}
        </>
      ) : <div className="my-hirmand-error">این کد در حال حاضر قابل دریافت نیست؛ ممکن است درخواست حذف شده باشد یا سامانه موقتاً در دسترس نباشد.</div>}
      <div className="my-hirmand-card-foot"><Link to="/request-tracking">صفحه کامل پیگیری</Link><span>ذخیره‌شده روی همین دستگاه</span></div>
    </article>
  );
}

export const Route = createFileRoute("/my-hirmand")({
  head: () => ({ meta: [
    { title: `پرونده‌های من | ${SITE.nameFa}` },
    { name: "description", content: "مرکز مشتری هیرمند برای نگهداری کدهای رهگیری و مشاهده وضعیت درخواست‌ها." },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: MyHirmandPage,
});

function MyHirmandPage() {
  const [items, setItems] = useState<CustomerTrackingSummary[]>([]);
  const [results, setResults] = useState<Record<string, TrackingResult | null>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [codeInput, setCodeInput] = useState("");
  const [message, setMessage] = useState("");
  const [loadingAll, setLoadingAll] = useState(false);
  const totalActive = useMemo(() => items.filter((item) => results[item.trackingCode]).length, [items, results]);

  useEffect(() => {
    const reload = () => setItems(readCustomerTrackingCodes());
    reload();
    window.addEventListener("hirmand:tracking-codes-changed", reload as EventListener);
    return () => window.removeEventListener("hirmand:tracking-codes-changed", reload as EventListener);
  }, []);

  const loadCode = useCallback(async (code: string) => {
    const trackingCode = normalizeCustomerTrackingCode(code);
    setBusy((prev) => ({ ...prev, [trackingCode]: true }));
    try {
      const response = await fetch("/api/public-lead-tracking?code=" + encodeURIComponent(trackingCode), {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const data = await response.json().catch(() => null) as TrackingResult & { statusMessage?: string } | null;
      if (!response.ok || !data?.trackingCode) throw new Error(data?.statusMessage || "درخواست پیدا نشد.");
      setResults((prev) => ({ ...prev, [trackingCode]: data }));
    } catch {
      setResults((prev) => ({ ...prev, [trackingCode]: null }));
    } finally {
      setBusy((prev) => ({ ...prev, [trackingCode]: false }));
    }
  }, []);

  useEffect(() => {
    const codes = readCustomerTrackingCodes();
    if (codes.length) void Promise.all(codes.map((item) => loadCode(item.trackingCode)));
  }, [loadCode]);

  async function refreshAll() {
    const codes = readCustomerTrackingCodes(); setItems(codes); setLoadingAll(true);
    try { await Promise.all(codes.map((item) => loadCode(item.trackingCode))); } finally { setLoadingAll(false); }
  }

  function addCode(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeCustomerTrackingCode(codeInput);
    if (!/^HIR-[A-Z0-9]{2}-[A-F0-9]{12}$/.test(normalized)) { setMessage("کد رهگیری معتبر را به شکل HIR-26-XXXXXXXXXXXX وارد کنید."); return; }
    rememberCustomerTrackingCode(normalized); setCodeInput(""); setMessage("کد به «پرونده‌های من» اضافه شد."); void loadCode(normalized);
  }

  function copyCode(code: string) {
    if (!navigator.clipboard?.writeText) {
      setMessage("کپی کد در این مرورگر در دسترس نیست.");
      return;
    }
    void navigator.clipboard.writeText(code).then(
      () => setMessage("کد رهگیری کپی شد."),
      () => setMessage("کپی کد در این مرورگر در دسترس نیست."),
    );
  }

  return (
    <SiteChrome>
      <main className="my-hirmand-page" id="top">
        <section className="my-hirmand-hero"><div><span className="kicker">مرکز مشتری هیرمند</span><h1>پرونده‌های من</h1><p>کدهای رهگیری درخواست‌هایتان را یک‌جا نگه دارید و وضعیت، مشاور، فایل مرتبط و تاریخچه هر درخواست را سریع ببینید.</p></div><div className="my-hirmand-hero-badge"><History size={42}/><strong>{totalActive.toLocaleString("fa-IR")}</strong><span>پرونده قابل مشاهده</span></div></section>
        <section className="my-hirmand-control-card"><form className="my-hirmand-add-form" onSubmit={addCode}>
          <label className="field"><span>افزودن کد رهگیری</span><input value={codeInput} onChange={(event) => setCodeInput(normalizeCustomerTrackingCode(event.target.value).slice(0,23))} placeholder="HIR-26-XXXXXXXXXXXX" dir="ltr" maxLength={23} autoComplete="off" /></label>
          <button type="submit" className="btn-gold">افزودن پرونده</button>
          <button type="button" className="btn-ghost" onClick={() => void refreshAll()} disabled={loadingAll || !items.length}><RefreshCw size={15} className={loadingAll ? "my-hirmand-spin" : undefined}/> بروزرسانی همه</button>
          {items.length ? <button type="button" className="btn-ghost" onClick={() => { clearCustomerTrackingCodes(); setResults({}); setMessage("کدهای ذخیره‌شده از این دستگاه پاک شدند."); }}>پاک‌کردن همه</button> : null}
        </form>{message ? <p className="my-hirmand-message" role="status">{message}</p> : null}</section>
        {items.length ? <section className="my-hirmand-grid">{items.map((item) => <CustomerRequestCard key={item.trackingCode} item={item} result={results[item.trackingCode] ?? null} busy={Boolean(busy[item.trackingCode])} onRemove={() => { forgetCustomerTrackingCode(item.trackingCode); setResults((prev) => { const next = {...prev}; delete next[item.trackingCode]; return next; }); }} onCopy={() => copyCode(item.trackingCode)} />)}</section> : <section className="my-hirmand-empty"><div className="my-hirmand-empty-icon"><History size={24}/></div><h2>هنوز پرونده‌ای ذخیره نشده است.</h2><p>بعد از هر ثبت یا پیگیری درخواست، کد را می‌توانید در این دستگاه نگه دارید.</p><div><Link className="btn-gold" to="/request-tracking">پیگیری یک کد</Link><Link className="btn-ghost" to="/properties">مشاهده فایل‌ها</Link></div></section>}
        <OwnerPropertyStatus />
        <section className="my-hirmand-note"><strong>حریم خصوصی</strong><p>این صفحه حساب کاربری دائمی ندارد؛ کدهای رهگیری فقط در حافظه مرورگر همین دستگاه ذخیره می‌شوند و نام و شماره موبایل شما نمایش داده نمی‌شود.</p></section>
      </main>
    </SiteChrome>
  );
}
