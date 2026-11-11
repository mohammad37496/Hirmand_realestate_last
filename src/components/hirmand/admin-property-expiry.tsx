import { useCallback, useEffect, useState } from "react";
import { Archive, CheckCircle2, Clock3, ExternalLink, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";

type Item = {
  id: string;
  slug: string;
  title: string;
  neighborhood: string;
  unpublishAt?: string;
  publishedAt: string | null;
  updatedAt?: string;
};

const dt = (value: string) => new Date(value).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });

export function AdminPropertyExpiryCenter() {
  const [data, setData] = useState<{ expired: Item[]; soon: Item[]; review: Item[] }>({ expired: [], soon: [], review: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-property-expiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.statusMessage || "مرکز انقضا در دسترس نیست.");
      setData({ expired: result.expired || [], soon: result.soon || [], review: result.review || [] });
      setHasLoaded(true);
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "بارگذاری انجام نشد.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: string, id?: string, days?: number) => {
    setBusy(action + (id || ""));
    try {
      const response = await fetch("/api/admin-property-expiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, id, days }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.statusMessage || "عملیات انجام نشد.");
      await load();
      toast.success(action === "archiveExpired"
        ? String(result.archived || 0) + " فایل منقضی بایگانی شد."
        : action === "createTasks"
          ? String(result.createdTasks || 0) + " پیگیری تمدید ساخته شد."
          : "زمان انتشار فایل تمدید شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "عملیات انجام نشد.");
    } finally {
      setBusy("");
    }
  };

  const render = (title: string, items: Item[], tone: string) => (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div><span className="kicker">چرخه عمر فایل</span><h2>{title}</h2></div>
      </div>
      {!items.length ? (
        <div className="admin-empty"><CheckCircle2 size={24} /><strong>موردی در این صف نیست.</strong></div>
      ) : (
        <div className="admin-expiry-list">
          {items.slice(0, 20).map((item) => (
            <article className={"admin-expiry-row " + tone} key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <small>{item.neighborhood || "—"} · {item.unpublishAt
                  ? "پایان انتشار: " + dt(item.unpublishAt)
                  : "انتشار: " + dt(item.publishedAt || item.updatedAt || new Date().toISOString())}</small>
              </div>
              <a href={"/properties/" + encodeURIComponent(item.slug)} target="_blank" rel="noreferrer" className="text-link">
                <ExternalLink size={13} /> مشاهده
              </a>
              {tone !== "danger" ? (
                <button className="btn-ghost" type="button" onClick={() => void act("extend", item.id, 30)} disabled={busy === "extend" + item.id}>
                  <RotateCcw size={13} /> +۳۰ روز
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="admin-expiry-center" dir="rtl">
      {loadError ? (
        <div className="admin-panel" role="alert">
          <strong>{hasLoaded ? "به‌روزرسانی مرکز انقضا ناموفق بود." : "اطلاعات مرکز انقضا دریافت نشد."}</strong>
          <p>{loadError}</p>
          <button className="btn-ghost" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} /> تلاش دوباره
          </button>
        </div>
      ) : null}
      {!hasLoaded ? (
        loading && !loadError ? <div className="admin-empty" role="status">در حال دریافت وضعیت انقضای فایل‌ها…</div> : null
      ) : (
        <>
          <div className="admin-dashboard-mini-grid">
            <div data-tone="danger"><span>منقضی‌شده</span><strong>{data.expired.length.toLocaleString("fa-IR")}</strong></div>
            <div data-tone="warn"><span>در ۷ روز آینده</span><strong>{data.soon.length.toLocaleString("fa-IR")}</strong></div>
            <div data-tone="info"><span>نیازمند بازبینی</span><strong>{data.review.length.toLocaleString("fa-IR")}</strong></div>
          </div>
          <div className="admin-expiry-actions">
            <button className="btn-gold" type="button" onClick={() => void act("archiveExpired")} disabled={!!busy || !data.expired.length}>
              <Archive size={15} /> بایگانی همه منقضی‌ها
            </button>
            <button className="btn-ghost" type="button" onClick={() => void act("createTasks")} disabled={!!busy}>
              <Clock3 size={15} /> ساخت پیگیری تمدید
            </button>
            <button className="btn-ghost" type="button" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={15} /> بررسی مجدد
            </button>
          </div>
          {render("فایل‌های منقضی‌شده", data.expired, "danger")}
          {render("فایل‌هایی که تا ۷ روز دیگر منقضی می‌شوند", data.soon, "warn")}
          {render("فایل‌های قدیمی بدون تاریخ پایان انتشار", data.review, "info")}
        </>
      )}
    </div>
  );
}
