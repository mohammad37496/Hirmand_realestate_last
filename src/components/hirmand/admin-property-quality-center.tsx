import { useCallback, useState } from "react";
import { AlertTriangle, BadgeCheck, ExternalLink, Gauge, ImageOff, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import "@/admin-property-quality.css";

type ScanData = {
  scannedAt?: string;
  media: { checked: number; issues: Array<{ propertyId: string; slug: string; title: string; neighborhood: string; url: string; status: number | null; reason: string }> };
  priceAnomalies: Array<{
    propertyId: string;
    slug: string;
    title: string;
    neighborhood: string;
    areaM2: number | null;
    price: number | null;
    pricePerM2: number | null;
    neighborhoodMedianPerM2: number | null;
    groupCount: number;
    issue: string;
  }>;
  verificationDue: Array<{
    propertyId: string;
    slug: string;
    title: string;
    neighborhood: string;
    lastVerifiedAt: string | null;
    lastVerifiedBy: string | null;
  }>;
};

function money(value: number | null) {
  return value && value > 0 ? Math.round(value).toLocaleString("fa-IR") : "—";
}
function faDate(value: string | null) {
  if (!value) return "هنوز بازبینی نشده";
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(value));
}

export function AdminPropertyQualityCenter() {
  const [data, setData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-property-quality", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "scan" }),
      });
      const payload = await response.json().catch(() => null) as ScanData & { statusMessage?: string };
      if (!response.ok || !payload?.media) throw new Error(payload?.statusMessage || "اسکن کیفیت فایل‌ها انجام نشد.");
      setData(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "اسکن کیفیت فایل‌ها انجام نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function verify(propertyId: string) {
    setBusyId(propertyId);
    try {
      const response = await fetch("/api/admin-property-quality", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "verify", propertyId }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; statusMessage?: string };
      if (!response.ok || !payload?.success) throw new Error(payload?.statusMessage || "بازبینی ثبت نشد.");
      toast.success("بازبینی فایل ثبت شد.");
      await scan();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بازبینی ثبت نشد.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-property-quality admin-panel" aria-labelledby="admin-property-quality-title">
      <div className="admin-panel-head">
        <div>
          <span className="kicker">کنترل کیفیت فایل</span>
          <h2 id="admin-property-quality-title">مرکز سلامت و بازبینی فایل‌ها</h2>
          <p className="admin-property-quality-intro">سه کنترل مهم را یکجا بررسی کن: سلامت تصاویر، ناهنجاری‌های قیمتی و زمان آخرین بازبینی.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void scan()} disabled={loading}>
          <RefreshCw size={15} className={loading ? "admin-spin" : ""} />
          {loading ? "در حال اسکن…" : "اسکن دوباره"}
        </button>
      </div>

      {!data ? (
        <div className="admin-property-quality-empty">
          <Gauge size={24} />
          <strong>برای شروع، اسکن سلامت فایل‌ها را اجرا کنید.</strong><small>در هر اسکن، بخشی از رسانه‌ها و همه فایل‌های فروش برای بررسی داده‌ای کنترل می‌شوند.</small>
        </div>
      ) : (
        <>
          <div className="admin-property-quality-stats">
            <div><span><ImageOff size={15}/> رسانه مشکل‌دار</span><strong>{data.media.issues.length.toLocaleString("fa-IR")}</strong><small>{data.media.checked.toLocaleString("fa-IR")} رسانه بررسی شد</small></div>
            <div><span><AlertTriangle size={15}/> ناهنجاری قیمت</span><strong>{data.priceAnomalies.length.toLocaleString("fa-IR")}</strong><small>هشدار داده‌ای؛ نه ارزش‌گذاری کارشناسی</small></div>
            <div><span><ShieldCheck size={15}/> بازبینی عقب‌افتاده</span><strong>{data.verificationDue.length.toLocaleString("fa-IR")}</strong><small>بیش از ۱۴ روز یا بدون بازبینی</small></div>
          </div>

          <div className="admin-property-quality-grid">
            <section className="admin-property-quality-list">
              <div className="admin-property-quality-list-head">
                <div><strong>رسانه‌هایی که نیاز به بررسی دارند</strong><span>{data.media.issues.length.toLocaleString("fa-IR")} مورد</span></div>
              </div>
              {data.media.issues.length ? data.media.issues.slice(0, 10).map((item) => (
                <article key={item.propertyId + item.url} className="admin-property-quality-row">
                  <div className="admin-property-quality-row-main">
                    <ImageOff size={17} />
                    <div><strong>{item.title}</strong><small>{item.neighborhood} · {item.reason}</small></div>
                  </div>
                  <div className="admin-property-quality-row-actions">
                    <a href={"/properties/" + encodeURIComponent(item.slug)} target="_blank" rel="noreferrer"><ExternalLink size={13}/> فایل</a>
                    <a href={item.url} target="_blank" rel="noreferrer">رسانه</a>
                  </div>
                </article>
              )) : <div className="admin-property-quality-ok"><BadgeCheck size={18}/> رسانه مشکل‌دار در اسکن اخیر پیدا نشد.</div>}
            </section>

            <section className="admin-property-quality-list">
              <div className="admin-property-quality-list-head">
                <div><strong>قیمت‌هایی که نیاز به بازبینی دارند</strong><span>{data.priceAnomalies.length.toLocaleString("fa-IR")} مورد</span></div>
              </div>
              {data.priceAnomalies.length ? data.priceAnomalies.slice(0, 10).map((item) => (
                <article key={item.propertyId} className="admin-property-quality-row">
                  <div className="admin-property-quality-row-main">
                    <AlertTriangle size={17} />
                    <div>
                      <strong>{item.title}</strong>
                      <small>
                        {item.issue === "missing"
                          ? "قیمت یا متراژ برای محاسبه کافی نیست."
                          : "قیمت هر متر: " + money(item.pricePerM2) + " تومان · میانه مشابه‌ها: " + money(item.neighborhoodMedianPerM2) + " تومان"}
                      </small>
                    </div>
                  </div>
                  <div className="admin-property-quality-row-actions">
                    <a href={"/properties/" + encodeURIComponent(item.slug)} target="_blank" rel="noreferrer"><ExternalLink size={13}/> فایل</a>
                  </div>
                </article>
              )) : <div className="admin-property-quality-ok"><BadgeCheck size={18}/> مورد غیرعادی بر اساس فیلتر فعلی پیدا نشد.</div>}
            </section>
          </div>

          <section className="admin-property-quality-list admin-property-quality-verification">
            <div className="admin-property-quality-list-head">
              <div><strong>فایل‌های نیازمند ثبت بازبینی هیرمند</strong><span>{data.verificationDue.length.toLocaleString("fa-IR")} مورد</span></div>
            </div>
            {data.verificationDue.length ? data.verificationDue.slice(0, 12).map((item) => (
              <article key={item.propertyId} className="admin-property-quality-row">
                <div className="admin-property-quality-row-main">
                  <ShieldCheck size={17} />
                  <div><strong>{item.title}</strong><small>{item.neighborhood} · {faDate(item.lastVerifiedAt)}</small></div>
                </div>
                <div className="admin-property-quality-row-actions">
                  <a href={"/properties/" + encodeURIComponent(item.slug)} target="_blank" rel="noreferrer"><ExternalLink size={13}/> فایل</a>
                  <button type="button" onClick={() => void verify(item.propertyId)} disabled={busyId === item.propertyId}>{busyId === item.propertyId ? "در حال ثبت…" : "ثبت بازبینی"}</button>
                </div>
              </article>
            )) : <div className="admin-property-quality-ok"><BadgeCheck size={18}/> همه فایل‌های این صف در ۱۴ روز اخیر بازبینی شده‌اند.</div>}
          </section>

          {data.scannedAt ? <p className="admin-property-quality-note">آخرین اسکن: {faDate(data.scannedAt)} · اسکن رسانه فقط بخش محدودی از رسانه‌های اخیر را برای سرعت بررسی می‌کند.</p> : null}
        </>
      )}
    </section>
  );
}
