import { HardDrive, RefreshCw, ShieldCheck, Trash2, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cleanupAdminMedia, getAdminMediaHealth, type MediaHealth } from "@/lib/admin-media-health";

function formatBytes(bytes: number) {
  if (!bytes) return "۰ بایت";
  const units = ["بایت", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} ${units[index]}`;
}

export function AdminMediaHealth() {
  const [data, setData] = useState<MediaHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);

  async function scan() {
    setLoading(true);
    try {
      setData(await getAdminMediaHealth({ data: { staleMinutes: 120 } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بررسی رسانه‌ها انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void scan(); }, []);

  async function cleanup() {
    const ok = window.confirm("رسانه‌های یتیم داخل پایگاه داده و آپلودهای نیمه‌کاره قدیمی پاک شوند؟ فایل‌های موجود در Liara Object Storage به‌صورت حدسی حذف نمی‌شوند.");
    if (!ok) return;
    setCleaning(true);
    try {
      const result = await cleanupAdminMedia({ data: { staleMinutes: 120 } });
      toast.success(`${result.orphanDeleted.toLocaleString("fa-IR")} رسانه یتیم و ${result.staleSessionsDeleted.toLocaleString("fa-IR")} آپلود نیمه‌کاره پاک شد.`);
      await scan();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "پاک‌سازی رسانه‌ها انجام نشد.");
    } finally {
      setCleaning(false);
    }
  }

  return (
    <main className="admin-settings-page">
      <section className="admin-panel admin-settings-hero">
        <div className="admin-settings-hero-icon"><HardDrive size={28} /></div>
        <div>
          <span className="kicker">Storage Health</span>
          <h2>سلامت و پاک‌سازی رسانه‌ها</h2>
          <p>رسانه‌های ذخیره‌شده در دیتابیس، فایل‌های بدون مرجع و آپلودهای نیمه‌کاره را بررسی و پاک‌سازی کنید.</p>
        </div>
        <div className="admin-settings-actions">
          <button className="btn-ghost" type="button" onClick={() => void scan()} disabled={loading || cleaning}>
            <RefreshCw size={15} className={loading ? "admin-spin" : ""} /> بررسی
          </button>
          <button className="btn-ghost danger" type="button" onClick={() => void cleanup()} disabled={cleaning || loading}>
            <Trash2 size={15} /> پاک‌سازی
          </button>
        </div>
      </section>

      {data ? (
        <>
          <div className="admin-settings-grid admin-media-health-grid">
            <div className="admin-panel admin-health-card"><span>رسانه داخل DB</span><strong>{data.storedObjects.toLocaleString("fa-IR")}</strong><small>{formatBytes(data.storedBytes)}</small></div>
            <div className="admin-panel admin-health-card"><span>رسانه دارای مرجع</span><strong>{data.referencedDatabaseObjects.toLocaleString("fa-IR")}</strong><small>در فایل‌های فعال</small></div>
            <div className="admin-panel admin-health-card" data-tone={data.orphanObjects ? "danger" : undefined}><span>رسانه یتیم</span><strong>{data.orphanObjects.toLocaleString("fa-IR")}</strong><small>قابل پاک‌سازی امن از DB</small></div>
            <div className="admin-panel admin-health-card" data-tone={data.staleUploadSessions ? "danger" : undefined}><span>آپلود نیمه‌کاره</span><strong>{data.staleUploadSessions.toLocaleString("fa-IR")}</strong><small>{data.staleUploadChunks.toLocaleString("fa-IR")} تکه‌ی معلق</small></div>
          </div>

          <section className="admin-panel">
            <div className="admin-panel-head">
              <div><span className="kicker">محافظت</span><h2>پاک‌سازی محافظه‌کارانه</h2></div>
              <ShieldCheck size={18} />
            </div>
            <div className="admin-health-rules">
              <div><HardDrive size={15} /><span>فقط رسانه‌های DB که دیگر هیچ فایل فعالی به آن‌ها ارجاع نمی‌دهد حذف می‌شوند.</span></div>
              <div><Unplug size={15} /><span>رسانه‌های موجود در Liara Object Storage یا URLهای خارجی عمداً در این پاک‌سازی دستکاری نمی‌شوند.</span></div>
              <div><ShieldCheck size={15} /><span>آپلودهای بدون تکمیلِ بیشتر از ۲ ساعت نیز قابل جمع‌آوری هستند تا حجم DB بی‌جهت رشد نکند.</span></div>
            </div>
            <small className="admin-health-timestamp">آخرین اسکن: {new Date(data.scannedAt).toLocaleString("fa-IR")}</small>
          </section>
        </>
      ) : (
        <div className="admin-empty">{loading ? "در حال اسکن رسانه‌ها…" : "داده‌ای برای نمایش نیست."}</div>
      )}
    </main>
  );
}
