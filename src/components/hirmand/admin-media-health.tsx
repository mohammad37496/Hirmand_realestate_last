import { HardDrive, RefreshCw, ShieldCheck, Trash2, Unplug } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminErrorBanner } from "@/components/hirmand/admin-ui";
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

export function AdminMediaHealth({ canCleanup }: { canCleanup: boolean }) {
  const [data, setData] = useState<MediaHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [loadError, setLoadError] = useState("");

  const scan = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setData(null);
    try {
      const result = await getAdminMediaHealth({ data: { staleMinutes: 120 } });
      if (result.available !== true) {
        throw new Error(result.statusMessage || "پایگاه داده در دسترس نیست؛ سلامت رسانه‌ها قابل بررسی نیست.");
      }
      setData(result);
    } catch (error) {
      setData(null);
      setLoadError(error instanceof Error ? error.message : "بررسی رسانه‌ها انجام نشد.");
      toast.error(error instanceof Error ? error.message : "بررسی رسانه‌ها انجام نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void scan(); }, [scan]);

  async function cleanup() {
    const ok = window.confirm("رسانه‌های یتیم و آپلودهای نیمه‌کاره قدیمی بررسی و پاک‌سازی شوند؟ فایل‌های Liara فقط پس از بررسی مرجع‌ها و ثبت کار قابل‌بازیابی حذف می‌شوند.");
    if (!ok) return;
    setCleaning(true);
    try {
      const result = await cleanupAdminMedia({ data: { staleMinutes: 120 } });
      const retained = result.orphanRetained + result.staleMediaRetained;
      toast.success(`${result.orphanDeleted.toLocaleString("fa-IR")} رسانه یتیم حذف شد؛ ${result.staleSessionsDeleted.toLocaleString("fa-IR")} نشست منقضی جمع‌آوری شد${retained ? `؛ ${retained.toLocaleString("fa-IR")} رسانهٔ مشترک حفظ شد` : ""}${result.cleanupPending ? `؛ ${result.cleanupPending.toLocaleString("fa-IR")} پاک‌سازی در صف retry باقی ماند` : ""}.`);
      await scan();
    } catch (error) {
      setData(null);
      setLoadError(error instanceof Error ? error.message : "پاک‌سازی رسانه‌ها انجام نشد.");
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
          {canCleanup ? (
            <button className="btn-ghost danger" type="button" onClick={() => void cleanup()} disabled={cleaning || loading || !data || Boolean(loadError)}>
              <Trash2 size={15} /> پاک‌سازی
            </button>
          ) : null}
        </div>
      </section>

      {loading ? (
        <div className="admin-empty" role="status">در حال اسکن رسانه‌ها…</div>
      ) : loadError ? (
        <AdminErrorBanner message={loadError} onRetry={() => void scan()} />
      ) : data ? (
        <>
          <div className="admin-settings-grid admin-media-health-grid">
            <div className="admin-panel admin-health-card"><span>رسانه داخل DB</span><strong>{data.storedObjects.toLocaleString("fa-IR")}</strong><small>{formatBytes(data.storedBytes)}</small></div>
            <div className="admin-panel admin-health-card"><span>رسانه دارای مرجع</span><strong>{data.referencedDatabaseObjects.toLocaleString("fa-IR")}</strong><small>در فایل‌های فعال</small></div>
            <div className="admin-panel admin-health-card" data-tone={data.orphanObjects ? "danger" : undefined}><span>رسانه یتیم</span><strong>{data.orphanObjects.toLocaleString("fa-IR")}</strong><small>قابل پاک‌سازی امن از DB</small></div>
            <div className="admin-panel admin-health-card" data-tone={data.staleUploadSessions ? "danger" : undefined}><span>آپلود نیمه‌کاره</span><strong>{data.staleUploadSessions.toLocaleString("fa-IR")}</strong><small>{data.staleUploadChunks.toLocaleString("fa-IR")} تکه‌ی معلق</small></div>
            <div className="admin-panel admin-health-card" data-tone={data.pendingMediaCleanupJobs ? "danger" : undefined}><span>پاک‌سازی در انتظار retry</span><strong>{data.pendingMediaCleanupJobs.toLocaleString("fa-IR")}</strong><small>کارهای ذخیره‌شده و قابل‌بازیابی</small></div>
          </div>

          <section className="admin-panel">
            <div className="admin-panel-head">
              <div><span className="kicker">محافظت</span><h2>پاک‌سازی محافظه‌کارانه</h2></div>
              <ShieldCheck size={18} />
            </div>
            <div className="admin-health-rules">
              <div><HardDrive size={15} /><span>فقط رسانه‌های DB که دیگر هیچ فایل فعالی به آن‌ها ارجاع نمی‌دهد حذف می‌شوند.</span></div>
              <div><Unplug size={15} /><span>فایل‌های Liara فقط پس از بررسی همهٔ مرجع‌ها و از مسیر صف قابل‌بازیابی حذف می‌شوند؛ URLهای خارجی ناشناخته دست‌نخورده می‌مانند.</span></div>
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
