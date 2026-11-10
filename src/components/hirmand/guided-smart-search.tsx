import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { NEIGHBORHOOD_NAMES } from "@/lib/site";
import { formatToman, parseAmount } from "@/lib/money";
import {
  matchPublishedPropertiesBySmartSearch,
  type PropertySmartMatch,
  type PropertyType,
} from "@/lib/properties";
import { parseSmartBudgetAmount, SMART_MATCH_WEIGHTS, smartMatchReasons, type SmartMatchPreferences } from "@/lib/smart-property-match";
import { PropertyCard } from "./property-showcase";

type AmenityChoice = "parking" | "elevator" | "storage";

const STEPS = ["نوع ملک", "بودجه", "محدوده‌ها", "متراژ", "تعداد خواب", "امکانات"];
const PROPERTY_CHOICES: Array<{ value: PropertyType; label: string }> = [
  { value: "apartment", label: "آپارتمان" },
  { value: "villa", label: "ویلا و باغ" },
  { value: "office", label: "اداری" },
  { value: "commercial", label: "تجاری" },
  { value: "heritage", label: "کلنگی" },
  { value: "land", label: "زمین" },
];
const BEDROOM_CHOICES = [
  { value: "any", label: "فرقی ندارد" },
  { value: "0", label: "بدون خواب" },
  { value: "1", label: "۱ خواب" },
  { value: "2", label: "۲ خواب" },
  { value: "3", label: "۳ خواب" },
  { value: "4", label: "۴ خواب یا بیشتر" },
] as const;
const AMENITY_CHOICES: Array<{ value: AmenityChoice; label: string }> = [
  { value: "parking", label: "پارکینگ" },
  { value: "elevator", label: "آسانسور" },
  { value: "storage", label: "انباری" },
];

function formatRange(min: number | undefined, max: number | undefined, suffix: string) {
  if (min !== undefined && max !== undefined) return `${min.toLocaleString("fa-IR")} تا ${max.toLocaleString("fa-IR")} ${suffix}`;
  if (min !== undefined) return `از ${min.toLocaleString("fa-IR")} ${suffix}`;
  if (max !== undefined) return `تا ${max.toLocaleString("fa-IR")} ${suffix}`;
  return "";
}

function parseAreaInput(value: string): number {
  if (/[−-]/.test(value)) return 0;
  const amount = parseAmount(value);
  return Number.isInteger(amount) && amount > 0 ? amount : 0;
}

export function GuidedSmartSearch() {
  const [step, setStep] = useState(1);
  const [propertyType, setPropertyType] = useState<PropertyType>("apartment");
  const [minPriceText, setMinPriceText] = useState("");
  const [maxPriceText, setMaxPriceText] = useState("");
  const [neighborhoodQuery, setNeighborhoodQuery] = useState("");
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  const [minAreaText, setMinAreaText] = useState("");
  const [maxAreaText, setMaxAreaText] = useState("");
  const [bedrooms, setBedrooms] = useState<(typeof BEDROOM_CHOICES)[number]["value"]>("any");
  const [amenities, setAmenities] = useState<AmenityChoice[]>([]);
  const [results, setResults] = useState<PropertySmartMatch[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const visibleNeighborhoods = useMemo(() => {
    const query = neighborhoodQuery.trim();
    return NEIGHBORHOOD_NAMES
      .filter((name) => !neighborhoods.includes(name) && (!query || name.includes(query)))
      .slice(0, 12);
  }, [neighborhoodQuery, neighborhoods]);

  const preferences = useMemo<SmartMatchPreferences>(() => {
    const minPrice = minPriceText.trim() ? parseSmartBudgetAmount(minPriceText) : undefined;
    const maxPrice = maxPriceText.trim() ? parseSmartBudgetAmount(maxPriceText) : undefined;
    const minArea = minAreaText.trim() ? parseAreaInput(minAreaText) : undefined;
    const maxArea = maxAreaText.trim() ? parseAreaInput(maxAreaText) : undefined;
    return {
      ...(minPrice ? { minPrice } : {}),
      ...(maxPrice ? { maxPrice } : {}),
      neighborhoods,
      ...(minArea ? { minArea } : {}),
      ...(maxArea ? { maxArea } : {}),
      ...(bedrooms === "any" ? {} : bedrooms === "4" ? { minBedrooms: 4 } : { exactBedrooms: Number(bedrooms) }),
      amenities,
    };
  }, [minPriceText, maxPriceText, neighborhoods, minAreaText, maxAreaText, bedrooms, amenities]);

  function toggleNeighborhood(name: string) {
    setNeighborhoods((current) => current.includes(name) ? current.filter((item) => item !== name) : current.length < 12 ? [...current, name] : current);
  }

  function toggleAmenity(value: AmenityChoice) {
    setAmenities((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function validateStep(): boolean {
    if (step === 2) {
      const min = minPriceText.trim() ? parseSmartBudgetAmount(minPriceText) : undefined;
      const max = maxPriceText.trim() ? parseSmartBudgetAmount(maxPriceText) : undefined;
      if ((minPriceText.trim() && !min) || (maxPriceText.trim() && !max)) {
        toast.error("بودجه را با عدد معتبر و واحد تومان، میلیون یا میلیارد وارد کنید.");
        return false;
      }
      if (min !== undefined && max !== undefined && min > max) {
        toast.error("حداقل بودجه نباید از حداکثر بودجه بیشتر باشد.");
        return false;
      }
    }
    if (step === 4) {
      const min = minAreaText.trim() ? parseAreaInput(minAreaText) : undefined;
      const max = maxAreaText.trim() ? parseAreaInput(maxAreaText) : undefined;
      if ((minAreaText.trim() && !min) || (maxAreaText.trim() && !max)) {
        toast.error("متراژ را با عدد معتبر وارد کنید.");
        return false;
      }
      if (min !== undefined && max !== undefined && min > max) {
        toast.error("حداقل متراژ نباید از حداکثر متراژ بیشتر باشد.");
        return false;
      }
    }
    return true;
  }

  async function runSearch() {
    if (!validateStep()) return;
    const hasPreference = preferences.minPrice !== undefined || preferences.maxPrice !== undefined
      || preferences.neighborhoods.length > 0 || preferences.minArea !== undefined || preferences.maxArea !== undefined
      || preferences.minBedrooms !== undefined || preferences.exactBedrooms !== undefined || preferences.amenities.length > 0;
    if (!hasPreference) {
      toast.info("برای رتبه‌بندی، دست‌کم یک معیار مانند بودجه، محله، متراژ یا امکانات انتخاب کنید.");
      return;
    }
    setLoading(true);
    setSearched(false);
    setResults([]);
    try {
      const rows = await matchPublishedPropertiesBySmartSearch({
        data: {
          transactionType: "sell",
          propertyType,
          ...preferences,
          limit: 12,
        },
      });
      setResults(rows);
      setSearched(true);
      if (!rows.length) toast.info("فایل منتشرشده‌ای با معیارهای انتخابی پیدا نشد.");
    } catch {
      toast.error("جستجوی مرحله‌ای انجام نشد؛ دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep(1);
    setPropertyType("apartment");
    setMinPriceText("");
    setMaxPriceText("");
    setNeighborhoodQuery("");
    setNeighborhoods([]);
    setMinAreaText("");
    setMaxAreaText("");
    setBedrooms("any");
    setAmenities([]);
    setResults([]);
    setSearched(false);
  }

  const summary = [
    "فایل فروش",
    PROPERTY_CHOICES.find((item) => item.value === propertyType)?.label ?? propertyType,
    preferences.minPrice !== undefined || preferences.maxPrice !== undefined
      ? `${preferences.minPrice !== undefined ? `از ${formatToman(preferences.minPrice)}` : ""}${preferences.minPrice !== undefined && preferences.maxPrice !== undefined ? " تا " : ""}${preferences.maxPrice !== undefined ? `تا ${formatToman(preferences.maxPrice)}` : ""} تومان`
      : "",
    ...neighborhoods,
    formatRange(preferences.minArea, preferences.maxArea, "متر"),
    preferences.exactBedrooms !== undefined ? `${preferences.exactBedrooms.toLocaleString("fa-IR")} خواب` : preferences.minBedrooms !== undefined ? `${preferences.minBedrooms.toLocaleString("fa-IR")} خواب یا بیشتر` : "",
    ...amenities.map((item) => AMENITY_CHOICES.find((choice) => choice.value === item)?.label ?? item),
  ].filter(Boolean);

  return (
    <section className="guided-smart-search" aria-labelledby="guided-smart-search-title">
      <div className="guided-smart-search-intro">
        <span className="kicker">جستجوی مرحله‌ای</span>
        <h1 id="guided-smart-search-title">ملک مناسب را با معیارهای خودتان پیدا کنید.</h1>
        <p>شش مرحله کوتاه را کامل کنید؛ فایل‌های منتشرشده بر اساس میزان تطابق با معیارهای انتخابی رتبه‌بندی می‌شوند.</p>
      </div>

      <div className="guided-search-panel">
        <div className="guided-search-progress">
          <span>مرحله {step.toLocaleString("fa-IR")} از ۶</span>
          <strong>{STEPS[step - 1]}</strong>
          <div className="guided-search-progress-track" role="progressbar" aria-label="پیشرفت جستجو" aria-valuemin={1} aria-valuemax={6} aria-valuenow={step}><span style={{ width: `${(step / 6) * 100}%` }}/></div>
        </div>

        {step === 1 ? <div className="guided-search-step">
          <h2>چه نوع ملکی می‌خواهید؟</h2>
          <p>در این جستجو فقط فایل‌های فروشِ منتشرشده و قابل‌عرضه رتبه‌بندی می‌شوند.</p>
          <div className="guided-search-choice-grid" role="group" aria-label="نوع ملک">
            {PROPERTY_CHOICES.map((item) => <button key={item.value} type="button" className={propertyType === item.value ? "is-selected" : ""} aria-pressed={propertyType === item.value} onClick={() => setPropertyType(item.value)}>{item.label}</button>)}
          </div>
          <p className="guided-search-rent-link">برای رهن و اجاره، <a href="/budget-match">ابزار تطبیق بودجه</a> را ببینید.</p>
        </div> : null}

        {step === 2 ? <div className="guided-search-step">
          <h2>حدود بودجه شما چقدر است؟</h2>
          <p>می‌توانید حداقل، حداکثر یا هر دو را وارد کنید؛ عدد کامل تومان یا عبارت میلیون/میلیارد پذیرفته می‌شود.</p>
          <div className="guided-search-range">
            <label><span>حداقل بودجه</span><input inputMode="decimal" value={minPriceText} onChange={(event) => setMinPriceText(event.target.value)} placeholder="مثلاً ۵ میلیارد" aria-label="حداقل بودجه"/></label>
            <label><span>حداکثر بودجه</span><input inputMode="decimal" value={maxPriceText} onChange={(event) => setMaxPriceText(event.target.value)} placeholder="مثلاً ۸ میلیارد" aria-label="حداکثر بودجه"/></label>
          </div>
        </div> : null}

        {step === 3 ? <div className="guided-search-step">
          <h2>کدام محدوده‌ها را ترجیح می‌دهید؟</h2>
          <p>می‌توانید چند محله انتخاب کنید یا این مرحله را رد کنید.</p>
          <input className="guided-search-neighborhood-input" value={neighborhoodQuery} onChange={(event) => setNeighborhoodQuery(event.target.value)} placeholder="جستجوی نام محله…" aria-label="جستجوی محله"/>
          {neighborhoods.length ? <div className="guided-search-selected-neighborhoods">{neighborhoods.map((name) => <button key={name} type="button" onClick={() => toggleNeighborhood(name)}>{name} <span aria-hidden="true">×</span></button>)}</div> : null}
          <div className="guided-search-neighborhood-grid">
            {visibleNeighborhoods.map((name) => <button key={name} type="button" onClick={() => toggleNeighborhood(name)} disabled={neighborhoods.length >= 12}>{name}</button>)}
            {!visibleNeighborhoods.length ? <span className="guided-search-muted">{neighborhoods.length >= 12 ? "برای افزودن محله دیگر، ابتدا یکی از انتخاب‌ها را حذف کنید." : "محله دیگری پیدا نشد."}</span> : null}
          </div>
          <small>حداکثر ۱۲ محدوده قابل انتخاب است.</small>
        </div> : null}

        {step === 4 ? <div className="guided-search-step">
          <h2>چه متراژی مدنظر دارید؟</h2>
          <p>برای محدود کردن بازه، حداقل و حداکثر را وارد کنید.</p>
          <div className="guided-search-range">
            <label><span>حداقل متراژ (متر)</span><input inputMode="numeric" value={minAreaText} onChange={(event) => setMinAreaText(event.target.value)} placeholder="مثلاً ۹۰" aria-label="حداقل متراژ"/></label>
            <label><span>حداکثر متراژ (متر)</span><input inputMode="numeric" value={maxAreaText} onChange={(event) => setMaxAreaText(event.target.value)} placeholder="مثلاً ۱۵۰" aria-label="حداکثر متراژ"/></label>
          </div>
        </div> : null}

        {step === 5 ? <div className="guided-search-step">
          <h2>چند خواب مدنظر دارید؟</h2>
          <div className="guided-search-bedroom-grid" role="group" aria-label="تعداد خواب">
            {BEDROOM_CHOICES.map((item) => <button key={item.value} type="button" className={bedrooms === item.value ? "is-selected" : ""} aria-pressed={bedrooms === item.value} onClick={() => setBedrooms(item.value)}>{item.label}</button>)}
          </div>
        </div> : null}

        {step === 6 ? <div className="guided-search-step">
          <h2>چه امکاناتی برایتان مهم است؟</h2>
          <p>امکانات انتخابی در امتیاز تطبیق اثر دارند؛ انتخاب نکردن یعنی این موارد برای شما شرط نیستند.</p>
          <div className="guided-search-amenities">
            {AMENITY_CHOICES.map((item) => <button key={item.value} type="button" className={amenities.includes(item.value) ? "is-selected" : ""} aria-pressed={amenities.includes(item.value)} onClick={() => toggleAmenity(item.value)}>{amenities.includes(item.value) ? <Check size={16}/> : null}{item.label}</button>)}
          </div>
        </div> : null}

        <div className="guided-search-actions">
          <button type="button" className="btn-ghost" onClick={() => step > 1 ? setStep((current) => current - 1) : reset()}><ArrowRight size={16}/> {step > 1 ? "مرحله قبل" : "شروع دوباره"}</button>
          {step < 6 ? <button type="button" className="btn-gold" onClick={() => { if (validateStep()) setStep((current) => Math.min(6, current + 1)); }}>مرحله بعد <ArrowLeft size={16}/></button>
            : <button type="button" className="btn-gold" onClick={() => void runSearch()} disabled={loading}><Sparkles size={16}/>{loading ? "در حال رتبه‌بندی…" : "مشاهده بهترین تطابق‌ها"}</button>}
        </div>
      </div>

      {searched ? <section className="guided-search-results" aria-live="polite">
        <div className="guided-search-results-head">
          <div><span className="kicker">پیشنهادهای رتبه‌بندی‌شده</span><h2>بهترین فایل‌ها برای شما</h2><p>وزن امتیاز: بودجه {SMART_MATCH_WEIGHTS.budget}٪، محله {SMART_MATCH_WEIGHTS.neighborhoods}٪، متراژ {SMART_MATCH_WEIGHTS.area}٪، خواب {SMART_MATCH_WEIGHTS.bedrooms}٪ و امکانات {SMART_MATCH_WEIGHTS.amenities}٪. معیارهای ردشده از محاسبه حذف و وزن معیارهای انتخابی متناسب نرمال می‌شود؛ نوع ملک و معامله فیلتر الزامی هستند.</p></div>
          <div className="guided-search-results-actions"><button type="button" className="btn-ghost" onClick={() => setStep(1)}><SlidersHorizontal size={15}/> ویرایش معیارها</button><button type="button" className="btn-ghost" onClick={reset}><RotateCcw size={15}/> جستجوی دوباره</button></div>
        </div>
        <div className="smart-search-chips">{summary.map((item) => <span key={item}>{item}</span>)}</div>
        {results.length ? <div className="guided-search-result-grid">
          {results.map((match, index) => <article className="guided-search-result" key={match.property.id}>
            <div className="guided-search-match-head"><span>رتبه { (index + 1).toLocaleString("fa-IR") }</span><strong>{match.score.toLocaleString("fa-IR")}٪ تطابق</strong></div>
            <PropertyCard property={match.property}/>
            <div className="guided-search-reasons">{(smartMatchReasons(match.property, preferences).length ? smartMatchReasons(match.property, preferences) : ["نزدیک‌ترین گزینه به معیارهای انتخابی"]).map((reason) => <span key={reason}><Check size={13}/>{reason}</span>)}</div>
          </article>)}
        </div> : <div className="property-empty"><Search size={28}/><strong>فایل منتشرشده‌ای با این ترکیب پیدا نشد.</strong><p>بودجه یا محدوده را بازتر کنید و دوباره جستجو کنید.</p><button type="button" className="btn-ghost" onClick={() => setStep(2)}>ویرایش معیارها</button></div>}
      </section> : null}
    </section>
  );
}
