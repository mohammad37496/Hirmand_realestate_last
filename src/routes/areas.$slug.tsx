import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Eye,
  Home,
  KeyRound,
  MapPin,
  MapPinned,
  Phone,
  Search,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { listPublishedProperties } from "@/lib/properties";
import { getNeighborhoodMarketSnapshot, type NeighborhoodMarketSnapshot } from "@/lib/neighborhood-market";
import { findAreaBySlug, areaHead, areaJsonLd, areaPath, allAreas } from "@/lib/areas";
import { breadcrumbJsonLd } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { PropertyCard } from "@/components/hirmand/property-showcase";
import "@/area-detail-page.css";

type ListingFilter = "all" | "sale" | "rent";

export const Route = createFileRoute("/areas/$slug")({
  loader: async ({ params }) => {
    const area = findAreaBySlug(params.slug);
    if (!area) {
      return {
        area: null,
        properties: [] as Awaited<ReturnType<typeof listPublishedProperties>>,
        market: null as NeighborhoodMarketSnapshot | null,
      };
    }

    try {
      const [properties, market] = await Promise.all([
        listPublishedProperties({ data: { neighborhood: area.name } }),
        getNeighborhoodMarketSnapshot({ data: { neighborhood: area.name } }),
      ]);
      return { area, properties, market };
    } catch (error) {
      console.error("[area] properties loader failed", error);
      return { area, properties: [], market: null };
    }
  },
  head: ({ loaderData, params }) => areaHead(loaderData?.area ?? null, params.slug),
  component: AreaPage,
});

function AreaPage() {
  const { area, properties, market } = Route.useLoaderData();
  const [listingFilter, setListingFilter] = useState<ListingFilter>("all");

  const filteredProperties = useMemo(() => {
    if (listingFilter === "sale") {
      return properties.filter((property) => property.transactionType === "buy" || property.transactionType === "sell");
    }
    if (listingFilter === "rent") {
      return properties.filter((property) => property.transactionType === "rent" || property.transactionType === "mortgage");
    }
    return properties;
  }, [properties, listingFilter]);

  const saleCount = properties.filter(
    (property) => property.transactionType === "buy" || property.transactionType === "sell",
  ).length;
  const rentCount = properties.filter(
    (property) => property.transactionType === "rent" || property.transactionType === "mortgage",
  ).length;

  if (!area) {
    return (
      <SiteChrome className="property-detail-shell">
        <main className="area-page area-page-not-found">
          <MapPinned aria-hidden="true" />
          <h1>این محله پیدا نشد</h1>
          <p>محلهٔ درخواستی در فهرست مناطق تحت پوشش هیرمند نیست.</p>
          <Link to="/" hash="areas" className="area-button area-button-primary">
            <ArrowRight size={17} /> مشاهدهٔ محله‌ها
          </Link>
        </main>
      </SiteChrome>
    );
  }

  const crumbs = breadcrumbJsonLd([
    { name: "صفحه اصلی", path: "/" },
    { name: "محله‌ها", path: "/#areas" },
    { name: area.name, path: areaPath(area.slug) },
  ]);

  const nearby = allAreas()
    .filter((item) => item.groupTitle === area.groupTitle && item.slug !== area.slug)
    .slice(0, 6);

  const hasCoordinates = area.lat != null && area.lng != null;
  const mapsUrl = hasCoordinates
    ? `https://www.google.com/maps/search/?api=1&query=${area.lat},${area.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(area.address ?? `${area.name}، اصفهان`)}`;

  const marketStats = market
    ? [
        { label: "فایل فعال", value: market.activeFiles.toLocaleString("fa-IR"), note: "فایل‌های منتشرشده", icon: Home },
        { label: "فایل‌های فروش", value: market.saleFiles.toLocaleString("fa-IR"), note: "خرید و فروش ثبت‌شده", icon: Building2 },
        { label: "رهن و اجاره", value: market.rentFiles.toLocaleString("fa-IR"), note: "گزینه‌های اجاره‌ای", icon: KeyRound },
        { label: "فایل جدید", value: market.newFiles30d.toLocaleString("fa-IR"), note: "در ۳۰ روز اخیر", icon: CalendarDays },
        { label: "کاهش قیمت", value: market.priceDropFiles.toLocaleString("fa-IR"), note: "فایل دارای کاهش قیمت", icon: TrendingDown },
        { label: "بازدید آنلاین", value: market.views30d.toLocaleString("fa-IR"), note: "در ۳۰ روز اخیر", icon: Eye },
      ]
    : [];

  const selectFilter = (filter: ListingFilter) => setListingFilter(filter);

  return (
    <SiteChrome className="property-detail-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(areaJsonLd(area)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }}
      />

      <main className="area-page">
        <nav className="area-breadcrumbs" aria-label="مسیر صفحه">
          <Link to="/">صفحهٔ اصلی</Link>
          <span aria-hidden="true">/</span>
          <Link to="/" hash="areas">محله‌ها</Link>
          <span aria-hidden="true">/</span>
          <span className="area-breadcrumb-current">{area.name}</span>
        </nav>

        <section className="area-hero" aria-labelledby="area-title">
          <div className="area-hero-copy">
            <span className="area-eyebrow">
              <MapPin size={15} aria-hidden="true" />
              راهنمای املاک اصفهان
              <span aria-hidden="true">·</span>
              {area.groupTitle}
            </span>
            <h1 id="area-title">
              خرید، فروش و اجاره ملک در <span>{area.name}</span>
            </h1>
            <p className="area-hero-description">
              فایل‌های منتشرشده در {area.name} را یک‌جا بررسی کنید، گزینه‌ها را با هم مقایسه کنید
              و برای دریافت اطلاعات بیشتر یا هماهنگی بازدید با گروه مشاورین املاک هیرمند در ارتباط باشید.
            </p>
            <div className="area-hero-highlights" aria-label="خدمات محلی">
              <span><CheckCircle2 size={15} aria-hidden="true" /> مشاهدهٔ فایل‌های ثبت‌شده</span>
              <span><MapPinned size={15} aria-hidden="true" /> موقعیت روی نقشه</span>
              <span><Phone size={15} aria-hidden="true" /> هماهنگی با دفتر</span>
            </div>
            <div className="area-hero-actions">
              <a href="#area-listings" className="area-button area-button-primary">
                <Search size={18} aria-hidden="true" /> دیدن فایل‌های محله
                <ArrowLeft size={16} aria-hidden="true" />
              </a>
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="area-button area-button-secondary">
                <MapPinned size={18} aria-hidden="true" /> نمایش روی نقشه
              </a>
            </div>
          </div>

          <div className="area-visual-card" aria-label={`نمای گرافیکی موقعیت ${area.name} در اصفهان`}>
            <svg className="area-map-illustration" viewBox="0 0 600 640" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
              <defs>
                <pattern id="area-map-grid" width="42" height="42" patternUnits="userSpaceOnUse">
                  <path d="M 42 0 L 0 0 0 42" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="600" height="640" fill="url(#area-map-grid)" />
              <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M-40 148 C100 165 146 105 245 128 S438 213 650 164" stroke="#d9b77d" strokeOpacity=".8" strokeWidth="28" />
                <path d="M-30 152 C100 169 146 109 245 132 S438 217 640 168" stroke="#fff3d8" strokeOpacity=".62" strokeWidth="3" />
                <path d="M92 -30 C140 110 100 232 196 324 S336 485 290 690" stroke="#d6e0e2" strokeOpacity=".68" strokeWidth="20" />
                <path d="M95 -30 C143 110 103 232 199 324 S339 485 293 690" stroke="#fff" strokeOpacity=".52" strokeWidth="2" />
                <path d="M-30 438 C120 378 266 429 372 368 S526 280 640 306" stroke="#d6e0e2" strokeOpacity=".7" strokeWidth="16" />
                <path d="M-30 438 C120 378 266 429 372 368 S526 280 640 306" stroke="#fff" strokeOpacity=".52" strokeWidth="2" />
                <path d="M354 -30 C323 96 410 185 370 263 S473 436 621 497" stroke="#d6e0e2" strokeOpacity=".65" strokeWidth="13" />
                <path d="M-20 250 L170 225 294 278 445 238 620 260" stroke="rgba(255,255,255,.27)" strokeWidth="6" />
                <path d="M-20 250 L170 225 294 278 445 238 620 260" stroke="rgba(255,255,255,.48)" strokeWidth="1" />
                <path d="M-10 546 L126 500 248 530 393 482 622 565" stroke="rgba(255,255,255,.27)" strokeWidth="6" />
                <path d="M-10 546 L126 500 248 530 393 482 622 565" stroke="rgba(255,255,255,.48)" strokeWidth="1" />
              </g>
              <g fill="rgba(231,238,230,.13)" stroke="rgba(255,255,255,.15)" strokeWidth="1.5">
                <rect x="210" y="48" width="82" height="50" rx="7" />
                <rect x="300" y="51" width="38" height="48" rx="6" />
                <rect x="425" y="72" width="94" height="58" rx="8" />
                <rect x="235" y="177" width="62" height="53" rx="7" />
                <rect x="310" y="174" width="77" height="58" rx="7" />
                <rect x="415" y="177" width="50" height="48" rx="6" />
                <rect x="20" y="286" width="74" height="52" rx="8" />
                <rect x="115" y="283" width="56" height="55" rx="7" />
                <rect x="223" y="351" width="80" height="52" rx="8" />
                <rect x="322" y="337" width="50" height="56" rx="7" />
                <rect x="414" y="335" width="78" height="53" rx="8" />
                <rect x="335" y="525" width="90" height="49" rx="8" />
                <rect x="452" y="514" width="78" height="56" rx="8" />
              </g>
              <g fill="rgba(210,180,126,.2)" stroke="rgba(226,192,132,.45)" strokeWidth="1.5">
                <rect x="31" y="53" width="112" height="64" rx="9" />
                <rect x="450" y="405" width="90" height="54" rx="8" />
                <rect x="55" y="561" width="115" height="52" rx="8" />
              </g>
            </svg>
            <span className="area-map-label area-map-label-top">
              <MapPinned size={15} aria-hidden="true" /> اصفهان · {area.groupTitle}
            </span>
            <span className="area-map-pin" aria-hidden="true">
              <MapPin size={29} />
            </span>
            <div className="area-visual-caption">
              <strong>{area.name}، اصفهان</strong>
              <p>مشاهدهٔ فایل‌های این محدوده و بررسی موقعیت مکانی</p>
            </div>
            <span className="area-map-label area-map-label-bottom">
              <MapPin size={14} aria-hidden="true" /> موقعیت محله
            </span>
          </div>
        </section>

        <section className="area-quick-facts" aria-label="خلاصهٔ اطلاعات محله">
          <div className="area-quick-fact">
            <span className="area-quick-fact-icon"><Building2 aria-hidden="true" /></span>
            <div>
              <span>محدودهٔ فعالیت</span>
              <strong>{area.groupTitle}</strong>
            </div>
          </div>
          <div className="area-quick-fact">
            <span className="area-quick-fact-icon"><Home aria-hidden="true" /></span>
            <div>
              <span>فایل‌های این صفحه</span>
              <strong>{properties.length.toLocaleString("fa-IR")} فایل</strong>
            </div>
          </div>
          <div className="area-quick-fact">
            <span className="area-quick-fact-icon"><MapPinned aria-hidden="true" /></span>
            <div>
              <span>نقشه و مسیر</span>
              <strong>نمایش محدوده در نقشه</strong>
            </div>
          </div>
        </section>

        {market ? (
          <section className="area-market" aria-labelledby="area-market-title">
            <div className="area-section-heading">
              <div className="area-section-heading-copy">
                <span className="area-section-kicker">آمار ثبت‌شده در هیرمند</span>
                <h2 id="area-market-title">نمای کلی بازار {area.name}</h2>
                <p>خلاصهٔ فایل‌ها و تعامل‌های ثبت‌شده در سایت؛ نه برآورد قطعی کل بازار محله.</p>
              </div>
              <span className="area-market-disclaimer">آمار بر پایهٔ اطلاعات موجود و فعالیت ۳۰ روز اخیر سایت است.</span>
            </div>

            <div className="area-market-grid">
              {marketStats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div className="area-market-stat" key={stat.label}>
                    <div className="area-market-stat-top">
                      <span>{stat.label}</span>
                      <span className="area-market-stat-icon"><Icon aria-hidden="true" /></span>
                    </div>
                    <strong>{stat.value}</strong>
                    <small>{stat.note}</small>
                  </div>
                );
              })}
            </div>

            {(market.saleAvgPerM2 != null || market.rentAvg != null) ? (
              <p className="area-market-note">
                {market.saleAvgPerM2 != null ? (
                  <>میانگین ثبت‌شدهٔ قیمت فروش هر متر مربع: <strong>{Math.round(market.saleAvgPerM2).toLocaleString("fa-IR")} تومان</strong>. </> 
                ) : null}
                {market.rentAvg != null ? (
                  <>میانگین مبلغ اجارهٔ ثبت‌شده: <strong>{Math.round(market.rentAvg).toLocaleString("fa-IR")} تومان</strong>. </> 
                ) : null}
                این اعداد از فایل‌های موجود محاسبه شده‌اند و جایگزین ارزیابی تخصصی ملک نیستند.
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="area-listings-layout">
          <div className="area-main-column">
            <section className="area-listings" id="area-listings" aria-labelledby="area-listings-title">
              <div className="area-listings-heading">
                <div>
                  <span className="area-section-kicker">انتخاب ملک</span>
                  <h2 id="area-listings-title">فایل‌های {area.name}</h2>
                  <p>فایل‌های منتشرشده را ببینید و برای جزئیات هر ملک وارد صفحهٔ آن شوید.</p>
                </div>
                <span className="area-listings-count">{filteredProperties.length.toLocaleString("fa-IR")} فایل</span>
              </div>

              <div className="area-filter-row" role="group" aria-label="فیلتر نوع معامله">
                <button type="button" className="area-filter-button" aria-pressed={listingFilter === "all"} onClick={() => selectFilter("all")}>
                  همهٔ فایل‌ها ({properties.length.toLocaleString("fa-IR")})
                </button>
                <button type="button" className="area-filter-button" aria-pressed={listingFilter === "sale"} onClick={() => selectFilter("sale")}>
                  فروش ({saleCount.toLocaleString("fa-IR")})
                </button>
                <button type="button" className="area-filter-button" aria-pressed={listingFilter === "rent"} onClick={() => selectFilter("rent")}>
                  رهن و اجاره ({rentCount.toLocaleString("fa-IR")})
                </button>
              </div>

              {filteredProperties.length ? (
                <div className="property-grid">
                  {filteredProperties.map((property) => (
                    <PropertyCard key={property.id} property={property} />
                  ))}
                </div>
              ) : (
                <div className="area-empty-state">
                  <Home aria-hidden="true" />
                  <h3>{listingFilter === "all" ? "هنوز فایلی برای نمایش وجود ندارد" : "در این دسته فعلاً فایلی ثبت نشده است"}</h3>
                  <p>
                    برای اطلاع از فایل‌های جدید {area.name} می‌توانید درخواست خود را ثبت کنید تا گزینه‌های متناسب با نیازتان بررسی شوند.
                  </p>
                  <Link to="/" hash="inquiry" className="area-button area-button-primary">
                    ثبت درخواست فایل <ArrowLeft size={16} aria-hidden="true" />
                  </Link>
                </div>
              )}
            </section>

            {nearby.length ? (
              <section className="area-nearby-section" aria-labelledby="area-nearby-title">
                <div className="area-section-heading">
                  <div className="area-section-heading-copy">
                    <span className="area-section-kicker">برای بررسی گزینه‌های بیشتر</span>
                    <h2 id="area-nearby-title">محله‌های دیگر در {area.groupTitle}</h2>
                    <p>مناطق نزدیک را نیز بررسی کنید تا انتخاب‌های بیشتری داشته باشید.</p>
                  </div>
                </div>
                <div className="area-nearby-grid">
                  {nearby.map((item) => (
                    <Link
                      key={item.slug}
                      to="/areas/$slug"
                      params={{ slug: item.slug }}
                      className="area-nearby-link"
                    >
                      <span>{item.name}</span>
                      <ArrowLeft aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="area-sidebar" aria-label="مشاوره و اطلاعات بیشتر">
            <section className="area-sidebar-card area-sidebar-card-primary">
              <span className="area-sidebar-icon"><Phone aria-hidden="true" /></span>
              <h2>برای {area.name} مشاوره می‌خواهید؟</h2>
              <p>برای بررسی فایل‌ها، دریافت جزئیات و هماهنگی بازدید با دفتر هیرمند در تماس باشید.</p>
              <div className="area-sidebar-actions">
                <a href={`tel:${SITE.phone.mobile}`} className="area-button area-button-primary">
                  <Phone aria-hidden="true" /> تماس با دفتر
                </a>
                <Link to="/" hash="inquiry" className="area-button area-button-secondary">
                  فرم درخواست فایل
                </Link>
              </div>
            </section>

            <section className="area-sidebar-card area-sidebar-card-secondary">
              <span className="area-sidebar-icon"><MapPinned aria-hidden="true" /></span>
              <h2>موقعیت محله</h2>
              <p>{area.address ?? `${area.name}، اصفهان`}</p>
              <div className="area-sidebar-actions">
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="area-button area-button-secondary">
                  باز کردن در نقشه <ArrowLeft aria-hidden="true" />
                </a>
              </div>
              <div className="area-sidebar-list">
                <span><CheckCircle2 aria-hidden="true" /> اطلاعات فایل‌ها در یک صفحه</span>
                <span><CheckCircle2 aria-hidden="true" /> دسترسی مستقیم به جزئیات ملک</span>
                <span><CheckCircle2 aria-hidden="true" /> امکان ثبت درخواست اختصاصی</span>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </SiteChrome>
  );
}
