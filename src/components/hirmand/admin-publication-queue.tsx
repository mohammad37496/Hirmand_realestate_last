import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, ExternalLink, FileCheck2, X } from "lucide-react";
import { toast } from "sonner";
import { listPendingPublicationReviews, reviewPropertyPublication } from "@/lib/admin-publication";

type Review = {
  id: number; propertyId: string; title: string; slug: string; neighborhood: string;
  propertyStatus: string; requestedBy: string; requestNote: string; requestedAt: string;
  price: string | null; deposit: string | null; rent: string | null;
};

function date(value: string) {
  return new Date(value).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });
}

export function AdminPublicationQueue() {
  const [items, setItems] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listPendingPublicationReviews({ data: { limit: 50 } });
      setItems(rows as Review[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "صف تأیید انتشار دریافت نشد.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function review(id: number, decision: "approve" | "reject") {
    const note = window.prompt(decision === "approve" ? "یادداشت تأیید (اختیاری):" : "دلیل رد درخواست:", "");
    if (decision === "reject" && note === null) return;
    setBusy(id);
    try {
      await reviewPropertyPublication({ data: { reviewId: id, decision, note: note ?? "" } });
      setItems((current) => current.filter((item) => item.id !== id));
      toast.success(decision === "approve" ? "فایل منتشر شد." : "درخواست انتشار رد شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بررسی درخواست انجام نشد.");
    } finally { setBusy(null); }
  }

  return (
    <section className="admin-panel admin-publication-queue" aria-labelledby="admin-publication-queue-title">
      <div className="admin-panel-head">
        <div>
          <span className="kicker">کنترل انتشار</span>
          <h2 id="admin-publication-queue-title"><FileCheck2 size={19} /> صف تأیید انتشار</h2>
          <p className="admin-dashboard-summary">اعضای تیم می‌توانند فایل را برای انتشار درخواست کنند؛ فقط نقش‌های مجاز انتشار نهایی را تأیید می‌کنند.</p>
        </div>
        <span className="admin-publication-count">{items.length.toLocaleString("fa-IR")} درخواست</span>
      </div>
      {loading ? <div className="admin-empty">در حال دریافت صف انتشار…</div> : !items.length ? (
        <div className="admin-empty"><Check size={23} /><strong>صف تأیید انتشار خالی است.</strong><p>فعلاً فایل معطل تأیید مدیر نیست.</p></div>
      ) : (
        <div className="admin-publication-list">
          {items.map((item) => (
            <article key={item.id} className="admin-publication-row">
              <div className="admin-publication-icon"><Clock3 size={18} /></div>
              <div className="admin-publication-main">
                <div className="admin-publication-title"><strong>{item.title}</strong><small>{item.neighborhood} · {date(item.requestedAt)}</small></div>
                <p>درخواست‌کننده: <b>{item.requestedBy || "مدیر"}</b>{item.requestNote ? " · " + item.requestNote : ""}</p>
                <div className="admin-publication-tags">
                  <span>وضعیت: {item.propertyStatus === "draft" ? "پیش‌نویس" : item.propertyStatus}</span>
                  {item.price ? <span>قیمت: {Number(item.price).toLocaleString("fa-IR")}</span> : null}
                  {item.deposit ? <span>رهن: {Number(item.deposit).toLocaleString("fa-IR")}</span> : null}
                  {item.rent ? <span>اجاره: {Number(item.rent).toLocaleString("fa-IR")}</span> : null}
                </div>
              </div>
              <div className="admin-publication-actions">
                <a className="btn-ghost" href={"/properties/" + encodeURIComponent(item.slug)} target="_blank" rel="noreferrer"><ExternalLink size={14} /> پیش‌نمایش</a>
                <button type="button" className="btn-gold" disabled={busy === item.id} onClick={() => void review(item.id, "approve")}><Check size={14} /> تأیید</button>
                <button type="button" className="btn-ghost" disabled={busy === item.id} onClick={() => void review(item.id, "reject")}><X size={14} /> رد</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
