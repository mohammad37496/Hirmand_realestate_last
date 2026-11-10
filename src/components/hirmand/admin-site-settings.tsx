import { useEffect, useState } from "react";
import { Globe2, Megaphone, Phone, Save, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_COMMISSION_RATES, commissionRateStatus, updateCommissionRateConfig, type CommissionRateConfig } from "@/lib/commission";
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
  commissionRates: { ...DEFAULT_COMMISSION_RATES },
  updatedAt: null,
};

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  hint?: string;
  inputType?: "text" | "number" | "date" | "url";
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <label className="admin-settings-field">
      <span>{props.label}</span>
      {props.multiline ? (
        <textarea rows={4} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      ) : (
        <input
          type={props.inputType ?? "text"}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          step={props.step}
          min={props.min}
          max={props.max}
        />
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

  function setCommissionRate<K extends keyof CommissionRateConfig>(key: K, value: CommissionRateConfig[K]) {
    setForm((current) => ({
      ...current,
      commissionRates: updateCommissionRateConfig(current.commissionRates, key, value),
    }));
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
          commissionRates: form.commissionRates,
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

        <section className="admin-panel admin-settings-commission">
          <div className="admin-panel-head"><div><span className="kicker">محاسبات مالی</span><h2>نرخ‌های قابل تنظیم کمیسیون</h2></div><ShieldCheck size={18} /></div>
          <p>
            نرخ‌های درصدی این فرم فقط مدل برآورد نمونه‌اند و جایگزین ضریب ارزش معاملاتی و سقف مصوب شهرستان در آیین‌نامه اجرایی ۱۴۰۴ نیستند.
            ثبت منبع و بازه اعتبار، تأیید داخلی مدیریت است نه تأیید قانونی. با تغییر هر نرخ یا منبع، تأیید قبلی به‌صورت خودکار لغو می‌شود.
          </p>
          <div className="admin-settings-fields">
            <Field label="شهر / محدوده نرخ‌نامه" value={form.commissionRates.city} onChange={(v) => setCommissionRate("city", v)} />
            <Field label="کمیسیون کل خرید و فروش دو طرف (درصد)" value={String(form.commissionRates.saleTotalPercent)} onChange={(v) => setCommissionRate("saleTotalPercent", Number(v))} inputType="number" step={0.01} min={0.001} max={5} />
            <Field label="کمیسیون رهن هر طرف (درصد ودیعه)" value={String(form.commissionRates.rentDepositPercent)} onChange={(v) => setCommissionRate("rentDepositPercent", Number(v))} inputType="number" step={0.01} min={0} max={5} />
            <Field label="کمیسیون اجاره هر طرف (درصد اجاره ماهانه)" value={String(form.commissionRates.rentMonthlyPercent)} onChange={(v) => setCommissionRate("rentMonthlyPercent", Number(v))} inputType="number" step={0.1} min={0.01} max={100} />
            <Field label="مالیات ارزش افزوده (درصد)" value={String(form.commissionRates.vatPercent)} onChange={(v) => setCommissionRate("vatPercent", Number(v))} inputType="number" step={0.1} min={0} max={25} />
            <Field label="عنوان منبع نرخ‌نامه" value={form.commissionRates.sourceLabel} onChange={(v) => setCommissionRate("sourceLabel", v)} hint="نام مرجع یا سندی که نرخ از آن استخراج شده است." />
            <Field label="پیوند HTTPS منبع" value={form.commissionRates.sourceUrl} onChange={(v) => setCommissionRate("sourceUrl", v)} inputType="url" hint="پیوند باید امن و قابل بررسی باشد." />
            <Field label="شروع اعتبار (میلادی)" value={form.commissionRates.effectiveFrom} onChange={(v) => setCommissionRate("effectiveFrom", v)} inputType="date" />
            <Field label="پایان اعتبار (اختیاری)" value={form.commissionRates.effectiveTo} onChange={(v) => setCommissionRate("effectiveTo", v)} inputType="date" />
          </div>
          <label className="admin-settings-toggle">
            <input type="checkbox" checked={form.commissionRates.verified} onChange={(event) => setCommissionRate("verified", event.target.checked)} />
            <span><strong>تأیید مدیریتی منبع و بازه اعتبار نرخ‌ها</strong><small>این وضعیت فقط تأیید داخلی مدیریت است و به معنی تأیید رسمی یا قانونی تعرفه نیست.</small></span>
          </label>
          <div className="admin-settings-note">
            وضعیت فعلی: {commissionRateStatus(form.commissionRates) === "verified" ? "تأییدشده و در بازه اعتبار" : commissionRateStatus(form.commissionRates) === "upcoming" ? "هنوز وارد بازه اعتبار نشده" : commissionRateStatus(form.commissionRates) === "expired" ? "اعتبار نرخ‌نامه پایان یافته" : "تأییدنشده؛ صرفاً برآورد"}
          </div>
        </section>
      </div>

      <div className="admin-settings-note">
        <strong>ایمنی SEO:</strong>
        <span>فعال‌کردن noindex فقط روی صفحه اصلی اثر می‌گذارد؛ صفحات فایل و محله‌ها همچنان از منطق SEO اختصاصی خودشان استفاده می‌کنند.</span>
      </div>
    </main>
  );
}
