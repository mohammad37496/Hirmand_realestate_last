import { Copy, Gauge, WandSparkles } from "lucide-react";
import { toast } from "sonner";

const ASSISTANT_CSS = `
.admin-assistant-suggestion{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:12px;border:1px solid rgb(0 0 0 / .1);border-radius:13px;background:rgb(0 0 0 / .02);padding:12px 14px}
/* The text keeps a real basis so the action buttons wrap underneath it on a
   phone instead of squeezing the suggestion down to a 30px column. */
.admin-assistant-suggestion>div{min-width:0;flex:1 1 200px}
.admin-assistant-suggestion small{display:block;font-size:.66rem;color:rgb(0 0 0 / .52);margin-bottom:4px}
.admin-assistant-suggestion strong{display:block;font-size:.86rem;color:#111315;line-height:1.7}
.admin-assistant-suggestion p{margin:0;font-size:.78rem;line-height:1.9;color:rgb(0 0 0 / .68);display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.admin-assistant-suggestion .btn-ghost,.admin-assistant-suggestion .admin-icon-btn{flex:0 0 auto}
.admin-quality-note{display:block;margin-top:8px;font-size:.68rem;line-height:1.8;color:rgb(0 0 0 / .52)}

/* Admin 3.0 theme override */
.admin-assistant-suggestion{background:#fbfcfd!important;border-color:#dde4ea!important}.admin-assistant-suggestion small,.admin-quality-note{color:#66717d!important}.admin-assistant-suggestion strong{color:#122333!important}.admin-assistant-suggestion p{color:#475467!important}
.admin-assistant-suggestion .btn-ghost{background:#fff!important;color:#253545!important;border-color:#cbd5df!important}
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
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 8);

  return [
    `${TX[p.transactionType]} ${TYPE[p.propertyType]} ${p.neighborhood ? "در " + p.neighborhood + " " : ""}اصفهان`,
    details.length ? "؛ " + details.join("، ") : "",
    ".",
    featureList.length ? ` ویژگی‌ها: ${featureList.join("، ")}.` : "",
    " برای اطلاعات کامل، هماهنگی بازدید و دریافت جزئیات با مشاور هیرمند تماس بگیرید.",
  ].join("").replace(/\s+/g, " ").trim();
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
      <section className="admin-smart-card">
        <div className="admin-smart-head">
          <div>
            <h3><WandSparkles size={17} /> دستیار ثبت فایل</h3>
            <p>با اطلاعات فعلی، عنوان و متن حرفه‌ای آگهی را بسازید و با یک کلیک اعمال کنید.</p>
          </div>
          <button type="button" className="btn-ghost" onClick={() => {
            props.onApplyTitle(suggestedTitle);
            props.onApplyDescription(suggestedDescription);
            toast.success("عنوان و متن پیشنهادی اعمال شد.");
          }}>
            <WandSparkles size={15} /> اعمال هر دو
          </button>
        </div>

        <div className="admin-assistant-suggestion">
          <div>
            <small>عنوان پیشنهادی</small>
            <strong>{suggestedTitle || "اطلاعات اصلی ملک را تکمیل کنید."}</strong>
          </div>
          <button type="button" className="admin-icon-btn" onClick={() => copy(suggestedTitle)} title="کپی عنوان">
            <Copy size={15} />
          </button>
          <button type="button" className="btn-ghost" onClick={() => props.onApplyTitle(suggestedTitle)}>اعمال عنوان</button>
        </div>

        <div className="admin-assistant-suggestion">
          <div>
            <small>متن پیشنهادی آگهی</small>
            <p>{suggestedDescription}</p>
          </div>
          <button type="button" className="admin-icon-btn" onClick={() => copy(suggestedDescription)} title="کپی متن">
            <Copy size={15} />
          </button>
          <button type="button" className="btn-ghost" onClick={() => props.onApplyDescription(suggestedDescription)}>اعمال متن</button>
        </div>

        <div className="admin-quality">
          <Gauge size={16} />
          <div className="admin-quality-bar"><span style={{ width: score + "%" }} /></div>
          <span className="admin-quality-score">{score.toLocaleString("fa-IR")}%</span>
        </div>
        <small className="admin-quality-note">
          امتیاز تکمیل فایل بر اساس اطلاعات توصیفی، مشخصات، ویژگی‌ها و تعداد تصاویر محاسبه می‌شود.
        </small>
      </section>

      <aside className="admin-seo-preview">
        <small>پیش‌نمایش نتیجه جستجو</small>
        <strong>{(props.title || suggestedTitle || "عنوان فایل")}</strong>
        <p>{props.description || suggestedDescription}</p>
        <div className="admin-seo-preview-url">www.hirmandrealestate.ir/properties/preview</div>
      </aside>
    </div>
  );
}
