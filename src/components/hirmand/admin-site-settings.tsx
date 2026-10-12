import { useEffect, useState } from "react";
import { Globe2, Megaphone, Phone, Save, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  getAdminSiteSettings,
  updateAdminSiteSettings,
  type SiteSettings,
} from "@/lib/site-settings";

const empty: SiteSettings = {
  siteTitle: "",
  siteDescription: "",
  seoKeywords: "",
  googleSiteVerification: "",
  noindex: false,
  announcementEnabled: false,
  announcementText: "",
  phoneMobile: "",
  phoneOffice: "",
  whatsappUrl: "",
  instagramUrl: "",
  telegramUrl: "",
  eitaaUrl: "",
  address: "",
  officeHours: "",
  footerTagline: "",
  updatedAt: null,
};

function Field(props: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; hint?: string }) {
  return (
    <label className="admin-settings-field">
      <span>{props.label}</span>
      {props.multiline ? (
        <textarea rows={4} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      ) : (
        <input value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      )}
      {props.hint ? <small>{props.hint}</small> : null}
    </label>
  );
}

export function AdminSiteSettings() {
  const [form, setForm] = useState<SiteSettings>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setForm(await getAdminSiteSettings({ data: {} }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تنظیمات سایت دریافت نشد.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function set<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const result = await updateAdminSiteSettings({
        data: {
          siteTitle: form.siteTitle,
          siteDescription: form.siteDescription,
          seoKeywords: form.seoKeywords,
          googleSiteVerification: form.googleSiteVerification,
          noindex: form.noindex,
          announcementEnabled: form.announcementEnabled,
          announcementText: form.announcementText,
          phoneMobile: form.phoneMobile,
          phoneOffice: form.phoneOffice,
          whatsappUrl: form.whatsappUrl,
          instagramUrl: form.instagramUrl,
          telegramUrl: form.telegramUrl,
          eitaaUrl: form.eitaaUrl,
          address: form.address,
          officeHours: form.officeHours,
          footerTagline: form.footerTagline,
        },
      });
      setForm(result);
      toast.success("تنظیمات عمومی سایت ذخیره شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره تنظیمات انجام نشد.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="admin-empty">در حال دریافت تنظیمات سایت…</div>;

  return (
    <main className="admin-settings-page">
      <section className="admin-panel admin-settings-hero">
        <div className="admin-settings-hero-icon"><Globe2 size={28} /></div>
        <div>
          <span className="kicker">کنترل مرکزی سایت</span>
          <h2>تنظیمات عمومی و SEO</h2>
          <p>عنوان و توضیحات قابل ایندکس، اتصال Search Console و اطلاعات تماس عمومی از این بخش مدیریت می‌شوند.</p>
        </div>
        <button className="btn-gold" type="button" onClick={() => void save()} disabled={saving}>
          <Save size={16} /> {saving ? "در حال ذخیره…" : "ذخیره همه"}
        </button>
      </section>

      <div className="admin-settings-grid">
        <section className="admin-panel">
          <div className="admin-panel-head"><div><span className="kicker">SEO</span><h2>کنترل ایندکس</h2></div><Search size={18} /></div>
          <div className="admin-settings-fields">
            <Field label="عنوان اصلی سایت" value={form.siteTitle} onChange={(v) => set("siteTitle", v)} hint="برای صفحه اصلی؛ بهتر است کوتاه و دقیق باشد." />
            <Field label="توضیحات متا" value={form.siteDescription} onChange={(v) => set("siteDescription", v)} multiline hint="توضیح اصلی صفحه خانه که در نتایج جستجو استفاده می‌شود." />
            <Field label="کلمات کلیدی" value={form.seoKeywords} onChange={(v) => set("seoKeywords", v)} multiline hint="با ویرگول فارسی یا انگلیسی جدا کنید." />
            <Field label="Google Site Verification" value={form.googleSiteVerification} onChange={(v) => set("googleSiteVerification", v)} hint="مقدار content تگ تأیید Search Console را وارد کنید." />
            <label className="admin-settings-toggle">
              <input type="checkbox" checked={form.noindex} onChange={(e) => set("noindex", e.target.checked)} />
              <span><strong>حالت noindex</strong><small>برای مواقع نگهداری/تست؛ در این حالت صفحه اصلی درخواست ایندکس نمی‌کند.</small></span>
            </label>
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head"><div><span className="kicker">ارتباط</span><h2>تماس و شبکه‌های اجتماعی</h2></div><Phone size={18} /></div>
          <div className="admin-settings-fields">
            <Field label="شماره موبایل" value={form.phoneMobile} onChange={(v) => set("phoneMobile", v)} />
            <Field label="تلفن دفتر" value={form.phoneOffice} onChange={(v) => set("phoneOffice", v)} />
            <Field label="لینک واتساپ" value={form.whatsappUrl} onChange={(v) => set("whatsappUrl", v)} />
            <Field label="لینک اینستاگرام" value={form.instagramUrl} onChange={(v) => set("instagramUrl", v)} />
            <Field label="لینک تلگرام" value={form.telegramUrl} onChange={(v) => set("telegramUrl", v)} />
            <Field label="لینک ایتا" value={form.eitaaUrl} onChange={(v) => set("eitaaUrl", v)} />
            <Field label="آدرس دفتر" value={form.address} onChange={(v) => set("address", v)} multiline />
            <Field label="ساعت کاری" value={form.officeHours} onChange={(v) => set("officeHours", v)} />
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head"><div><span className="kicker">اعلان</span><h2>نوار اطلاع‌رسانی سایت</h2></div><Megaphone size={18} /></div>
          <label className="admin-settings-toggle">
            <input type="checkbox" checked={form.announcementEnabled} onChange={(e) => set("announcementEnabled", e.target.checked)} />
            <span><strong>نمایش اعلان</strong><small>یک پیام کوتاه در رابط عمومی سایت قابل نمایش است.</small></span>
          </label>
          <div style={{ marginTop: 12 }}>
            <Field label="متن اعلان" value={form.announcementText} onChange={(v) => set("announcementText", v)} multiline />
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head"><div><span className="kicker">فوتر</span><h2>متن معرفی پایین سایت</h2></div><ShieldCheck size={18} /></div>
          <Field label="شعار/توضیح کوتاه فوتر" value={form.footerTagline} onChange={(v) => set("footerTagline", v)} multiline />
        </section>
      </div>

      <div className="admin-settings-note">
        <strong>ایمنی SEO:</strong>
        <span>فعال‌کردن noindex فقط روی صفحه اصلی اثر می‌گذارد؛ صفحات فایل و محله‌ها همچنان از منطق SEO اختصاصی خودشان استفاده می‌کنند.</span>
      </div>
    </main>
  );
}
