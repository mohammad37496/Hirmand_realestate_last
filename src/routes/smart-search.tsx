import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Sparkles, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { PropertyCard } from "@/components/hirmand/property-showcase";
import { listPublishedPropertyCards, type PropertyCardData } from "@/lib/properties";
import { parseSmartPropertySearch, type SmartSearchResult } from "@/lib/smart-property-search";
import { absoluteUrl, socialMeta } from "@/lib/seo";

export const Route = createFileRoute("/smart-search")({
  head: () => {
    const title = "جستجوی هوشمند ملک | املاک هیرمند";
    const description = "عبارت فارسی خود را بنویسید؛ هیرمند آن را به فیلترهای ملکی تبدیل می‌کند.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow" },
        ...socialMeta({ title, description, url: absoluteUrl("/smart-search") }),
      ],
      links: [{ rel: "canonical", href: absoluteUrl("/smart-search") }],
    };
  },
  component: SmartSearchPage,
});

const EXAMPLES = [
  "آپارتمان دو خوابه تا ۸ میلیارد در مرداویج با آسانسور و پارکینگ",
  "خانه ۱۸۰ متری در جلفا تا ۱۵ میلیارد",
  "ویلا با ۳ خواب و پارکینگ",
  "اجاره آپارتمان دو خوابه تا ۲۰ میلیون در اصفهان",
];

function SmartSearchPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SmartSearchResult | null>(null);
  const [properties, setProperties] = useState<PropertyCardData[]>([]);
  const [loading, setLoading] = useState(false);

  async function runSearch(nextQuery = query) {
    const text = nextQuery.trim();
    if (!text) {
      toast.info("عبارت جستجو را وارد کنید.");
      return;
    }
    setLoading(true);
    try {
      const parsed = parseSmartPropertySearch(text);
      const rows = await listPublishedPropertyCards({ data: parsed.filters });
      setResult(parsed);
      setProperties(rows);
    } catch {
      toast.error("جستجو انجام نشد؛ دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SiteChrome className="property-detail-shell">
      <main className="smart-tool-page">
        <section className="smart-tool-hero">
          <span className="kicker">هوشمند، فارسی، سریع</span>
          <h1>ملک را مثل یک پیام برایمان جستجو کن.</h1>
          <p>لازم نیست ده‌ها فیلتر را باز کنید؛ نیازتان را با زبان طبیعی بنویسید تا به فیلترهای واقعی سایت تبدیل شود.</p>
          <form className="smart-search-form" onSubmit={(event) => { event.preventDefault(); void runSearch(); }}>
            <Search size={20} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="مثلاً آپارتمان دو خوابه تا ۸ میلیارد در مرداویج با آسانسور و پارکینگ" aria-label="جستجوی فارسی ملک" autoFocus />
            <button type="submit" className="btn-gold" disabled={loading}>
              <Sparkles size={16} />
              {loading ? "در حال جستجو…" : "جستجوی هوشمند"}
            </button>
          </form>
          <div className="smart-search-examples" aria-label="نمونه جستجو">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" className="smart-search-example" onClick={() => { setQuery(example); void runSearch(example); }}>
                {example}
              </button>
            ))}
          </div>
        </section>

        {result ? (
          <section className="smart-search-results" aria-live="polite">
            <div className="smart-search-result-head">
              <div>
                <span className="kicker">فیلترهای تشخیص‌داده‌شده</span>
                <h2>{properties.length.toLocaleString("fa-IR")} فایل پیدا شد</h2>
              </div>
              <Link to="/properties" className="btn-ghost"><SlidersHorizontal size={16} /> فیلترهای کامل</Link>
            </div>
            <div className="smart-search-chips">{result.summary.map((item) => <span key={item}>{item}</span>)}</div>
            {properties.length ? (
              <div className="property-grid">{properties.map((property) => <PropertyCard key={property.id} property={property} />)}</div>
            ) : (
              <section className="property-empty">
                <Search size={28} />
                <strong>فایلی با این ترکیب پیدا نشد.</strong>
                <p>عبارت را کمی بازتر بنویسید یا از فیلترهای کامل استفاده کنید.</p>
                <Link to="/properties" className="btn-gold">رفتن به فهرست فایل‌ها</Link>
              </section>
            )}
          </section>
        ) : null}
      </main>
    </SiteChrome>
  );
}
