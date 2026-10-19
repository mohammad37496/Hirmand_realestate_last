import { Copy, Gauge, WandSparkles } from "lucide-react";
import { toast } from "sonner";

const ASSISTANT_CSS = `
.admin-smart-tools{
  display:grid!important;
  grid-template-columns:minmax(0,1.28fr) minmax(270px,.72fr)!important;
  align-items:stretch;
  gap:16px!important;
  min-width:0;
}
.admin-smart-card,.admin-seo-preview{
  min-width:0;
  color:#203243!important;
  border:1px solid #e2d9ca!important;
  border-radius:20px!important;
  padding:20px!important;
  background:linear-gradient(160deg,#fff 0%,#fffdf9 68%,#f8f3e9 100%)!important;
  box-shadow:0 10px 28px rgb(24 39 53 / 5%)!important;
}
.admin-smart-card{display:flex;flex-direction:column;gap:0}
.admin-smart-head{
  display:flex!important;
  align-items:center!important;
  justify-content:space-between!important;
  gap:16px!important;
  padding-bottom:17px;
  margin:0 0 16px!important;
  border-bottom:1px solid #ece5da;
}
.admin-assistant-heading{display:flex;align-items:flex-start;gap:12px;min-width:0}
.admin-assistant-icon{
  display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;
  border-radius:14px;border:1px solid #e6d4ad;background:#fbf3e2;color:#8a611e;
}
.admin-assistant-heading-copy{min-width:0}
.admin-smart-head h3{
  display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  margin:0!important;color:#182c3d!important;font-size:1rem!important;font-weight:800;line-height:1.6;
}
.admin-assistant-pill{
  display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border:1px solid #e8ddc7;
  border-radius:999px;background:#fcf8ef;color:#866021;font-size:.62rem;font-weight:750;white-space:nowrap;
}
.admin-smart-head p{margin:5px 0 0!important;color:#687582!important;font-size:.76rem!important;line-height:1.9}
.admin-assistant-apply-all{
  flex:0 0 auto;min-height:42px!important;padding:9px 13px!important;border-radius:12px!important;
  color:#fff!important;border:1px solid #172f43!important;
  background:linear-gradient(135deg,#203b50,#142b3d)!important;
  box-shadow:0 5px 13px rgb(20 43 61 / 13%)!important;font-size:.76rem!important;font-weight:800!important;
}
.admin-assistant-apply-all:hover{filter:brightness(1.08)!important;transform:translateY(-1px)}
.admin-assistant-suggestion{
  display:flex!important;align-items:center!important;justify-content:space-between!important;gap:14px!important;
  margin:0 0 11px!important;padding:14px!important;border:1px solid #e2e6e9!important;
  border-radius:15px!important;background:#fff!important;min-width:0;
  transition:border-color .15s,box-shadow .15s;
}
.admin-assistant-suggestion:hover{border-color:#d7c39e!important;box-shadow:0 5px 15px rgb(32 48 61 / 4%)}
.admin-assistant-suggestion-content{min-width:0;flex:1 1 auto}
.admin-assistant-suggestion-label{display:flex;align-items:center;gap:7px;margin-bottom:7px}
.admin-assistant-number{
  display:grid;place-items:center;flex:0 0 23px;width:23px;height:23px;border-radius:8px;
  background:#f8f1e4;color:#8a611e;font-size:.66rem;font-weight:850;
}
.admin-assistant-suggestion small{display:block;margin:0!important;color:#6c7883!important;font-size:.68rem!important;font-weight:750}
.admin-assistant-suggestion strong{
  display:block;color:#172d3e!important;font-size:.91rem!important;font-weight:800;line-height:1.9!important;
  overflow-wrap:break-word;word-break:normal;
}
.admin-assistant-hint{display:block;margin-top:4px;color:#8a949c;font-size:.65rem;line-height:1.7}
.admin-assistant-suggestion p{
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;
  margin:0!important;color:#4d5d69!important;font-size:.77rem!important;line-height:1.95!important;
  overflow-wrap:break-word;word-break:normal;
}
.admin-assistant-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex:0 0 auto}
.admin-assistant-suggestion .admin-icon-btn{
  display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;min-height:38px;
  border:1px solid #e0e5e8!important;border-radius:11px!important;background:#fff!important;color:#586875!important;
}
.admin-assistant-suggestion .admin-icon-btn:hover{border-color:#c9ad77!important;background:#fcf8ef!important;color:#75551e!important}
.admin-assistant-suggestion .btn-ghost{
  min-height:38px!important;padding:7px 12px!important;border:1px solid #d9e0e5!important;
  border-radius:11px!important;background:#f7f9fa!important;color:#243b4c!important;
  font-size:.72rem!important;font-weight:800!important;white-space:nowrap;
}
.admin-assistant-suggestion .btn-ghost:hover{border-color:#c9ad77!important;background:#fcf8ef!important}
.admin-quality-panel{
  margin-top:5px;padding:15px;border:1px solid #e5dccb;border-radius:15px;
  background:linear-gradient(120deg,#faf7f0,#fffdf9);
}
.admin-quality-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}
.admin-quality-heading>div{min-width:0}
.admin-quality-heading strong{display:block;color:#263b4c;font-size:.78rem;font-weight:850}
.admin-quality-heading small{display:block;margin-top:3px;color:#7b8790;font-size:.65rem;line-height:1.7}
.admin-quality-score{
  display:inline-flex!important;align-items:center;justify-content:center;min-width:54px!important;
  padding:5px 10px;border:1px solid #e6d6b6;border-radius:10px;background:#fffaf0;
  color:#7b581d!important;font-size:.82rem!important;font-weight:900!important;
}
.admin-quality{display:flex;align-items:center;gap:10px;margin-top:13px!important;color:#8a6a31}
.admin-quality>svg{flex:0 0 auto}
.admin-quality-bar{height:9px;flex:1;border-radius:999px;background:#e8e9e7!important;overflow:hidden}
.admin-quality-bar span{
  display:block;height:100%;border-radius:inherit;
  background:linear-gradient(90deg,#9d762f 0%,#d4b46e 100%)!important;
  transition:width .25s ease;
}
.admin-quality-bottom{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-top:10px}
.admin-quality-status{
  display:inline-flex;align-items:center;padding:4px 8px;border-radius:8px;
  background:#f2eee5;color:#79602e;font-size:.64rem;font-weight:800;white-space:nowrap;
}
.admin-quality-status.is-good{background:#edf6f0;color:#2e6b49}
.admin-quality-status.is-mid{background:#fff5df;color:#8a611e}
.admin-quality-status.is-low{background:#f7eeee;color:#915248}
.admin-quality-note{display:block;margin:0!important;max-width:300px;color:#7b8790!important;font-size:.64rem!important;line-height:1.8!important}
.admin-seo-preview{position:relative;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:0}
.admin-seo-preview-top{display:flex;align-items:center;gap:10px;margin-bottom:18px;padding-bottom:15px;border-bottom:1px solid #ece5da}
.admin-seo-favicon{
  display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;border:1px solid #e5e8ea;
  border-radius:12px;background:#f5f7f8;color:#344b5b;font-size:1rem;font-weight:900;
}
.admin-seo-preview-top-copy{min-width:0;flex:1}
.admin-seo-preview-top small{display:block;margin:0!important;color:#20384a!important;font-size:.76rem!important;font-weight:850}
.admin-seo-preview-top span{display:block;margin-top:2px;color:#84909a;font-size:.64rem}
.admin-seo-preview-label{
  display:inline-flex!important;flex:0 0 auto;align-items:center;padding:4px 7px!important;
  margin:0!important;border:1px solid #e3e7e9;border-radius:8px;color:#65737d!important;
  background:#fff;font-size:.59rem!important;font-weight:750;
}
.admin-seo-preview strong{
  display:block;margin:0!important;color:#1a0dab!important;font-size:1rem!important;font-weight:600!important;line-height:1.8!important;
  overflow-wrap:break-word;word-break:normal;
}
.admin-seo-preview p{margin:8px 0 0!important;color:#4d5156!important;font-size:.75rem!important;line-height:2!important;overflow-wrap:break-word}
.admin-seo-preview-url{
  display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:13px!important;padding-top:12px;
  border-top:1px dashed #e0e4e6;color:#52636f!important;font-size:.68rem!important;direction:ltr;text-align:left;
  overflow-wrap:anywhere;word-break:normal;
}
.admin-seo-preview-url::before{
  content:"";display:inline-block;flex:0 0 7px;width:7px;height:7px;border-radius:50%;background:#9baf9e;
}
@media(max-width:900px){
  .admin-smart-tools{grid-template-columns:minmax(0,1fr)!important}
  .admin-seo-preview{order:2}
  .admin-smart-card{order:1}
}
@media(max-width:600px){
  .admin-smart-card,.admin-seo-preview{padding:14px!important;border-radius:16px!important}
  .admin-smart-head{align-items:stretch!important;flex-direction:column!important;gap:12px!important}
  .admin-assistant-apply-all{width:100%;min-height:44px!important}
  .admin-assistant-suggestion{align-items:stretch!important;flex-direction:column!important;gap:10px!important;padding:12px!important}
  .admin-assistant-actions{width:100%;display:grid;grid-template-columns:44px minmax(0,1fr);gap:8px}
  .admin-assistant-suggestion .admin-icon-btn{width:44px;height:42px;min-height:42px}
  .admin-assistant-suggestion .btn-ghost{min-height:42px!important;width:100%}
  .admin-quality-panel{padding:12px}
  .admin-quality-bottom{flex-direction:column;align-items:flex-start}
  .admin-quality-note{max-width:none}
  .admin-seo-preview-top{gap:8px}
}
@media(prefers-reduced-motion:reduce){
  .admin-assistant-suggestion,.admin-quality-bar span{transition:none}
}
`;

type Props = {
  transactionType: "sell" | "buy" | "rent" | "mortgage";
  propertyType: "apartment" | "villa" | "office" | "heritage" | "land" | "commercial";
  neighborhood: string;
  areaM2: string;
  bedrooms: string;
  bathrooms: string;
  builtYear: string;
  parking: boolean;
  elevator: boolean;
  storage: boolean;
  title: string;
  description: string;
  features: string;
  imageCount: number;
  onApplyTitle: (value: string) => void;
  onApplyDescription: (value: string) => void;
};

const TX: Record<Props["transactionType"], string> = {
  sell: "فروش",
  buy: "خرید",
  rent: "اجاره",
  mortgage: "رهن",
};

const TYPE: Record<Props["propertyType"], string> = {
  apartment: "آپارتمان",
  villa: "ویلا و باغ",
  office: "ملک اداری",
  heritage: "خانه اصیل",
  land: "زمین",
  commercial: "ملک تجاری",
};

function cleanNumber(raw: string) {
  const value = raw.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[^0-9]/g, "");
  return value ? Number(value) : null;
}

function buildTitle(p: Props) {
  const bits = [
    TX[p.transactionType],
    TYPE[p.propertyType],
    cleanNumber(p.areaM2) ? cleanNumber(p.areaM2) + " متر" : null,
    p.bedrooms && cleanNumber(p.bedrooms) ? cleanNumber(p.bedrooms) + " خواب" : null,
    p.neighborhood ? "در " + p.neighborhood : null,
  ].filter(Boolean);
  return bits.join(" | ");
}

function buildDescription(p: Props) {
  const details = [
    cleanNumber(p.areaM2) ? `متراژ ${cleanNumber(p.areaM2)} متر` : null,
    p.bedrooms && cleanNumber(p.bedrooms) ? `${cleanNumber(p.bedrooms)} خواب` : null,
    p.bathrooms && cleanNumber(p.bathrooms) ? `${cleanNumber(p.bathrooms)} سرویس` : null,
    p.builtYear && cleanNumber(p.builtYear) ? `ساخت ${cleanNumber(p.builtYear)}` : null,
    p.parking ? "پارکینگ" : null,
    p.elevator ? "آسانسور" : null,
    p.storage ? "انباری" : null,
  ].filter(Boolean);

  const featureList = p.features
    .split(/[\\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 8);

  return [
    `${TX[p.transactionType]} ${TYPE[p.propertyType]} ${p.neighborhood ? "در " + p.neighborhood + " " : ""}اصفهان`,
    details.length ? "؛ " + details.join("، ") : "",
    ".",
    featureList.length ? ` ویژگی‌ها: ${featureList.join("، ")}.` : "",
    " برای اطلاعات کامل، هماهنگی بازدید و دریافت جزئیات با مشاور هیرمند تماس بگیرید.",
  ].join("").replace(/\\s+/g, " ").trim();
}

function qualityScore(p: Props) {
  let score = 0;
  if (p.title.trim().length >= 12) score += 15;
  if (p.neighborhood.trim()) score += 15;
  if (cleanNumber(p.areaM2)) score += 10;
  if (cleanNumber(p.bedrooms)) score += 8;
  if (cleanNumber(p.bathrooms)) score += 6;
  if (cleanNumber(p.builtYear)) score += 6;
  if (p.parking || p.elevator || p.storage) score += 6;
  if (p.features.trim()) score += 10;
  if (p.description.trim().length >= 80) score += 14;
  if (p.imageCount >= 1) score += 6;
  if (p.imageCount >= 4) score += 4;
  return Math.min(score, 100);
}

export function AdminListingAssistant(props: Props) {
  const score = qualityScore(props);
  const suggestedTitle = buildTitle(props);
  const suggestedDescription = buildDescription(props);
  const qualityStatus = score >= 80 ? "is-good" : score >= 50 ? "is-mid" : "is-low";
  const qualityLabel = score >= 80 ? "اطلاعات مناسب" : score >= 50 ? "نیازمند تکمیل" : "اطلاعات اولیه ناقص است";

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("متن در کلیپ‌بورد کپی شد.");
    } catch {
      toast.error("کپی متن انجام نشد.");
    }
  }

  return (
    <div className="admin-smart-tools">
      <style>{ASSISTANT_CSS}</style>
      <section className="admin-smart-card" aria-label="دستیار هوشمند آگهی">
        <div className="admin-smart-head">
          <div className="admin-assistant-heading">
            <span className="admin-assistant-icon" aria-hidden="true"><WandSparkles size={20} /></span>
            <div className="admin-assistant-heading-copy">
              <h3>دستیار ثبت فایل <span className="admin-assistant-pill">پیشنهاد خودکار</span></h3>
              <p>عنوان و متن آگهی بر اساس مشخصات واردشده ساخته می‌شود؛ قبل از اعمال، پیشنهادها را بررسی کنید.</p>
            </div>
          </div>
          <button type="button" className="btn-gold admin-assistant-apply-all" onClick={() => {
            props.onApplyTitle(suggestedTitle);
            props.onApplyDescription(suggestedDescription);
            toast.success("عنوان و متن پیشنهادی اعمال شد.");
          }}>
            <WandSparkles size={15} /> اعمال عنوان و متن
          </button>
        </div>

        <div className="admin-assistant-suggestion is-title">
          <div className="admin-assistant-suggestion-content">
            <div className="admin-assistant-suggestion-label"><span className="admin-assistant-number">۱</span><small>عنوان پیشنهادی</small></div>
            <strong>{suggestedTitle || "اطلاعات اصلی ملک را تکمیل کنید."}</strong>
            <span className="admin-assistant-hint">عنوانی روشن برای نمایش بهتر فایل در فهرست آگهی‌ها</span>
          </div>
          <div className="admin-assistant-actions">
            <button type="button" className="admin-icon-btn" onClick={() => copy(suggestedTitle)} title="کپی عنوان" aria-label="کپی عنوان پیشنهادی">
              <Copy size={15} />
            </button>
            <button type="button" className="btn-ghost" onClick={() => {
              props.onApplyTitle(suggestedTitle);
              toast.success("عنوان پیشنهادی اعمال شد.");
            }}>اعمال عنوان</button>
          </div>
        </div>

        <div className="admin-assistant-suggestion is-description">
          <div className="admin-assistant-suggestion-content">
            <div className="admin-assistant-suggestion-label"><span className="admin-assistant-number">۲</span><small>متن پیشنهادی آگهی</small></div>
            <p>{suggestedDescription}</p>
            <span className="admin-assistant-hint">متن را با جزئیات واقعی ملک و امکانات ثبت‌شده تطبیق دهید.</span>
          </div>
          <div className="admin-assistant-actions">
            <button type="button" className="admin-icon-btn" onClick={() => copy(suggestedDescription)} title="کپی متن" aria-label="کپی متن پیشنهادی">
              <Copy size={15} />
            </button>
            <button type="button" className="btn-ghost" onClick={() => {
              props.onApplyDescription(suggestedDescription);
              toast.success("متن پیشنهادی اعمال شد.");
            }}>اعمال متن</button>
          </div>
        </div>

        <div className="admin-quality-panel">
          <div className="admin-quality-heading">
            <div>
              <strong>کیفیت و تکمیل آگهی</strong>
              <small>با تکمیل مشخصات و افزودن تصاویر، امتیاز به‌روز می‌شود.</small>
            </div>
            <span className="admin-quality-score">{score.toLocaleString("fa-IR")}٪</span>
          </div>
          <div className="admin-quality">
            <Gauge size={17} aria-hidden="true" />
            <div className="admin-quality-bar" role="progressbar" aria-label="امتیاز تکمیل آگهی" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}>
              <span style={{ width: score + "%" }} />
            </div>
          </div>
          <div className="admin-quality-bottom">
            <span className={"admin-quality-status " + qualityStatus}>{qualityLabel}</span>
            <small className="admin-quality-note">امتیاز بر اساس عنوان، توضیحات، مشخصات، ویژگی‌ها و تصاویر محاسبه می‌شود.</small>
          </div>
        </div>
      </section>

      <aside className="admin-seo-preview" aria-label="پیش‌نمایش نتیجه جستجو">
        <div className="admin-seo-preview-top">
          <span className="admin-seo-favicon" aria-hidden="true">ه</span>
          <div className="admin-seo-preview-top-copy">
            <small>پیش‌نمایش نتیجه جستجو</small>
            <span>املاک هیرمند · نمونه نمایش در جستجو</span>
          </div>
          <span className="admin-seo-preview-label">پیش‌نمایش</span>
        </div>
        <strong>{props.title || suggestedTitle || "عنوان فایل شما"}</strong>
        <p>{props.description || suggestedDescription}</p>
        <div className="admin-seo-preview-url">www.hirmandrealestate.ir / properties / preview</div>
      </aside>
    </div>
  );
}
