import { useEffect, useState } from "react";
import { CheckCircle2, Eye, Image as ImageIcon, RotateCcw, Save, ShieldCheck, SlidersHorizontal, ToggleLeft } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_PROPERTY_WATERMARK, invalidatePropertyWatermarkSettings, type PropertyWatermarkSettings } from "@/lib/property-watermark";
import { PropertyMediaWatermarkPreview } from "@/components/hirmand/property-media-watermark";
import "@/admin-watermark.css";

export function AdminWatermarkSettings() {
  const [settings, setSettings] = useState<PropertyWatermarkSettings>(DEFAULT_PROPERTY_WATERMARK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin-watermark", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "get" }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.settings) throw new Error(payload?.statusMessage || "تنظیمات واترمارک دریافت نشد.");
        if (active) setSettings(payload.settings);
      })
      .catch((error) => {
        if (active) toast.error(error instanceof Error ? error.message : "تنظیمات واترمارک دریافت نشد.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin-watermark", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "update", ...settings }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.statusMessage || "ذخیره تنظیمات واترمارک انجام نشد.");
      setSettings(payload.settings);
      invalidatePropertyWatermarkSettings();
      toast.success("تنظیمات واترمارک ذخیره شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره تنظیمات واترمارک انجام نشد.");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setSettings(DEFAULT_PROPERTY_WATERMARK);
  }

  return (
    <main className="admin-watermark-page">
      <section className="admin-watermark-hero">
        <div>
          <span className="kicker">برندینگ رسانه</span>
          <h1>واترمارک تصاویر و فیلم‌ها</h1>
          <p>واترمارک در گوشه پایین سمت راست قرار می‌گیرد. تصاویر و ویدئوهای جدید هنگام آپلود با همین تنظیمات پردازش می‌شوند؛ ویدئوها با FFmpeg داخل خود فایل encode می‌شوند.</p>
        </div>
        <div className="admin-watermark-hero-icon" aria-hidden="true"><ShieldCheck size={34} /></div>
      </section>

      <section className="admin-watermark-layout">
        <div className="admin-watermark-panel">
          <div className="admin-watermark-panel-head">
            <div><span className="kicker">تنظیمات</span><h2>نحوه نمایش واترمارک</h2></div>
            <span className={settings.enabled ? "admin-watermark-status is-on" : "admin-watermark-status"}>{settings.enabled ? "فعال" : "خاموش"}</span>
          </div>

          <div className="admin-watermark-form">
            <label className="admin-watermark-switch">
              <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings((current) => ({ ...current, enabled: e.target.checked }))} />
              <span><strong>واترمارک فعال باشد</strong><small>برای تصاویر و فیلم‌های فایل‌های ملکی</small></span>
              <ToggleLeft size={22} />
            </label>
            <label className="admin-watermark-switch">
              <input type="checkbox" checked={settings.showLogo} onChange={(e) => setSettings((current) => ({ ...current, showLogo: e.target.checked }))} />
              <span><strong>نمایش لوگوی هیرمند</strong><small>لوگوی اصلی سایت استفاده می‌شود</small></span>
              <ImageIcon size={20} />
            </label>
            <label className="admin-watermark-switch">
              <input type="checkbox" checked={settings.showText} onChange={(e) => setSettings((current) => ({ ...current, showText: e.target.checked }))} />
              <span><strong>نمایش نام سایت</strong><small>متن روی واترمارک قابل ویرایش است</small></span>
              <Eye size={20} />
            </label>

            <label className="field">
              <span>متن واترمارک</span>
              <input value={settings.text} maxLength={80} onChange={(e) => setSettings((current) => ({ ...current, text: e.target.value }))} placeholder="املاک هیرمند" />
            </label>

            <label className="admin-watermark-range">
              <span>شفافیت: {Math.round(settings.opacity * 100).toLocaleString("fa-IR")}٪</span>
              <input type="range" min="0.2" max="1" step="0.01" value={settings.opacity} onChange={(e) => setSettings((current) => ({ ...current, opacity: Number(e.target.value) }))} />
            </label>

            <label className="admin-watermark-range">
              <span>اندازه: {settings.size.toFixed(2)}</span>
              <input type="range" min="0.6" max="1.6" step="0.05" value={settings.size} onChange={(e) => setSettings((current) => ({ ...current, size: Number(e.target.value) }))} />
            </label>
          </div>

          <div className="admin-watermark-actions">
            <button type="button" className="btn-ghost" onClick={reset} disabled={saving || loading}><RotateCcw size={15} /> بازنشانی</button>
            <button type="button" className="btn-gold" onClick={() => void save()} disabled={saving || loading}><Save size={15} /> {saving ? "در حال ذخیره…" : "ذخیره تنظیمات"}</button>
          </div>
        </div>

        <div className="admin-watermark-preview-card">
          <div className="admin-watermark-preview-head"><div><span className="kicker">پیش‌نمایش</span><h2>ظاهر واترمارک</h2></div><CheckCircle2 size={20} /></div>
          <div className="admin-watermark-preview-media">
            <img src="/images/fallback/interior-01.webp" alt="پیش‌نمایش واترمارک" />
            <PropertyMediaWatermarkPreview settings={settings} />
          </div>
          <div className="admin-watermark-preview-note"><SlidersHorizontal size={15} /><span>این تنظیمات روی رسانه‌های جدید اعمال می‌شود. ویدئوی جدید پس از آپلود دیگر به لایه نمایشی وابسته نیست و واترمارک داخل خود فایل ذخیره می‌شود؛ رسانه‌های قدیمی همچنان واترمارک نمایشی می‌گیرند.</span></div>
        </div>
      </section>
    </main>
  );
}
