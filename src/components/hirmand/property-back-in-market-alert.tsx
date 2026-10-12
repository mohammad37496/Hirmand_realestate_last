import { useEffect, useState } from "react";
import { Bell, BellRing, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import type { PropertyAvailabilityStatus } from "@/lib/properties";
import { trackAnalyticsEvent } from "@/lib/analytics";

type Props = {
  slug: string;
  title: string;
  availabilityStatus: PropertyAvailabilityStatus;
};

const CLOSED = new Set<PropertyAvailabilityStatus>(["sold", "rented", "unavailable"]);

export function PropertyBackInMarketAlert({ slug, title, availabilityStatus }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!CLOSED.has(availabilityStatus)) return;
    let cancelled = false;
    void fetch("/api/property-watch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "sync" }),
    })
      .then((response) => response.ok ? response.json() as Promise<{ subscriptions?: Array<{ slug: string }> }> : null)
      .then((payload) => {
        if (cancelled) return;
        setEnabled(Boolean(payload?.subscriptions?.some((item) => item.slug === slug)));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [slug, availabilityStatus]);

  if (!CLOSED.has(availabilityStatus)) return null;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const action = enabled ? "unsubscribe" : "subscribe";
      const response = await fetch("/api/property-watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, slug }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; enabled?: boolean } | null;
      if (!response.ok || payload?.ok === false) throw new Error("watch request failed");
      setEnabled(action === "subscribe");
      trackAnalyticsEvent("property_price_watch", slug);
      toast.success(
        action === "subscribe"
          ? "اعلان بازگشت این فایل به بازار فعال شد."
          : "اعلان بازگشت فایل خاموش شد.",
      );
    } catch {
      toast.error("تغییر وضعیت اعلان انجام نشد؛ دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="property-back-in-market"
      className="property-new-feature property-back-in-market-alert"
      aria-labelledby="property-back-in-market-title"
    >
      <header className="property-new-feature-head">
        <div>
          <span className="kicker"><BellRing size={14} /> پیگیری وضعیت فایل</span>
          <h2 id="property-back-in-market-title">وقتی «{title}» دوباره قابل معامله شد، باخبر شوید</h2>
          <p>
            اعلان روی همین مرورگر ثبت می‌شود و وقتی وضعیت فایل در هیرمند تغییر کند، در مرکز اعلان‌ها نمایش داده خواهد شد.
          </p>
        </div>
        <span className="property-new-feature-badge"><Bell size={13} /> اعلان وضعیت</span>
      </header>

      <div className="property-back-in-market-body">
        <div className="property-back-in-market-copy">
          <strong>{loaded && enabled ? "این فایل را در حالت پیگیری دارید." : "حتی اگر فعلاً ناموجود است، می‌توانید آن را از دست ندهید."}</strong>
          <small>بدون نیاز به ثبت شماره موبایل؛ پیگیری به شناسه مرورگر شما متصل می‌شود.</small>
        </div>
        <button
          type="button"
          className={enabled ? "btn-ghost" : "btn-gold"}
          onClick={() => void toggle()}
          disabled={busy}
          aria-pressed={enabled}
        >
          {enabled ? <CheckCircle2 size={17} /> : <Bell size={17} />}
          {busy ? "در حال ثبت…" : enabled ? "پیگیری فعال است" : "اعلان بازگشت به بازار"}
        </button>
      </div>
    </section>
  );
}
