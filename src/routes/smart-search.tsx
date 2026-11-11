import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Search, Sparkles, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { GuidedSmartSearch } from "@/components/hirmand/guided-smart-search";
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
const SMART_SEARCH_PAGE_SIZE = 48;

function SmartSearchPage() {
  const [mode, setMode] = useState<"guided" | "text">("guided");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SmartSearchResult | null>(null);
  const [properties, setProperties] = useState<PropertyCardData[]>([]);
  const [searchError, setSearchError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const searchRequestId = useRef(0);

  async function runSearch(nextQuery = query) {
    const text = nextQuery.trim();
    if (!text) {
      // Invalidate any search or pagination request that is still in flight.
      searchRequestId.current += 1;
      setLoading(false);
      setLoadingMore(false);
      setHasMore(false);
      setResult(null);
      setProperties([]);
      setSearchError("");
      toast.info("عبارت جستجو را وارد کنید.");
      return;
    }
    const requestId = ++searchRequestId.current;
    setLoading(true);
    setLoadingMore(false);
    setHasMore(false);
    setResult(null);
    setProperties([]);
    setSearchError("");
    try {
      const parsed = parseSmartPropertySearch(text);
      const rows = await listPublishedPropertyCards({ data: { ...parsed.filters, offset: 0 } });
      if (requestId !== searchRequestId.current) return;
      setResult(parsed);
      setProperties(rows);
      setHasMore(rows.length === SMART_SEARCH_PAGE_SIZE);
    } catch {
      if (requestId === searchRequestId.current) {
        setSearchError("جستجو انجام نشد؛ نتایج قبلی نمایش داده نمی‌شوند. دوباره تلاش کنید.");
        toast.error("جستجو انجام نشد؛ دوباره تلاش کنید.");
      }
    } finally {
      if (requestId === searchRequestId.current) setLoading(false);
    }
  }

  async function loadMore() {
    if (!result || loading || loadingMore || !hasMore) return;
    const requestId = searchRequestId.current;
    const offset = properties.length;
    setLoadingMore(true);
    try {
      const rows = await listPublishedPropertyCards({ data: { ...result.filters, offset } });
      if (requestId !== searchRequestId.current) return;
      setProperties((current) => {
        const known = new Set(current.map((property) => property.id));
        return [...current, ...rows.filter((property) => !known.has(property.id))];
      });
      setHasMore(rows.length === SMART_SEARCH_PAGE_SIZE);
    } catch {
      if (requestId === searchRequestId.current) toast.error("دریافت فایل‌های بیشتر انجام نشد؛ دوباره تلاش کنید.");
    } finally {
      if (requestId === searchRequestId.current) setLoadingMore(false);
    }
  }

  return (
    <SiteChrome className="property-detail-shell">
      <main className="smart-tool-page">
        <div className="smart-search-mode-tabs" role="tablist" aria-label="روش جستجوی ملک">
          <button type="button" role="tab" aria-selected={mode === "guided"} className={mode === "guided" ? "is-active" : ""} onClick={() => setMode("guided")}>جستجوی مرحله‌ای و رتبه‌بندی</button>
          <button type="button" role="tab" aria-selected={mode === "text"} className={mode === "text" ? "is-active" : ""} onClick={() => setMode("text")}>جستجوی متنی فارسی</button>
        </div>
        {mode === "guided" ? <GuidedSmartSearch/> : <>
        <section className="smart-tool-hero">
          <span className="kicker">هوشمند، فارسی، سریع</span>
          <h1>ملک را مثل یک پیام برایمان جستجو کن.</h1>
          <p>لازم نیست ده‌ها فیلتر را باز کنید؛ نیازتان را با زبان طبیعی بنویسید تا به فیلترهای واقعی سایت تبدیل شود.</p>
          <form className="smart-search-form" onSubmit={(event) => { event.preventDefault(); void runSearch(); }}>
            <Search size={20} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="مثلاً آپارتمان دو خوابه تا ۸ میلیارد در مرداویج با آسانسور و پارکینگ" aria-label="جستجوی فارسی ملک" maxLength={80} autoFocus />
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

        {searchError ? (
          <section className="property-empty smart-search-error" role="alert">
            <Search size={28} />
            <strong>جستجوی جدید انجام نشد</strong>
            <p>{searchError}</p>
            <button type="button" className="btn-gold" onClick={() => void runSearch(query)} disabled={loading}>
              تلاش دوباره
            </button>
          </section>
        ) : null}

        {result ? (
          <section className="smart-search-results" aria-live="polite">
            <div className="smart-search-result-head">
              <div>
                <span className="kicker">فیلترهای تشخیص‌داده‌شده</span>
                <h2>{properties.length.toLocaleString("fa-IR")} فایل نمایش داده شده</h2>
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
            {hasMore ? <div className="smart-search-load-more"><button type="button" className="btn-ghost" onClick={() => void loadMore()} disabled={loadingMore || loading}>{loadingMore ? "در حال دریافت فایل‌ها…" : "نمایش فایل‌های بیشتر"}</button></div> : null}
          </section>
        ) : null}
        </>}
      </main>
    </SiteChrome>
  );
}
