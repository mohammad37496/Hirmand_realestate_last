import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
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
} from "lucide-react";
import { listPublishedProperties } from "@/lib/properties";
import { getNeighborhoodMarketSnapshot, type NeighborhoodMarketSnapshot } from "@/lib/neighborhood-market";
import { findAreaBySlug, areaHead, areaJsonLd, areaPath, allAreas } from "@/lib/areas";
import { getAreaGeography } from "@/lib/neighborhood-geo";
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
            مشاهدهٔ محله‌ها
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

  const geography = getAreaGeography(area.slug);
  const hasCoordinates = geography !== null;
  const mapsUrl = geography
    ? `https://www.google.com/maps/search/?api=1&query=${geography.lat},${geography.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${area.name}، اصفهان، ایران`)}`;
  const mapDelta = 0.018;
  const mapBounds = geography
    ? [
        geography.lng - mapDelta,
        geography.lat - mapDelta,
        geography.lng + mapDelta,
        geography.lat + mapDelta,
      ].map((value) => value.toFixed(5)).join(",")
    : "";
  const mapEmbedUrl = geography
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(mapBounds)}&layer=mapnik&marker=${geography.lat}%2C${geography.lng}`
    : "";

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
                
              </a>
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="area-button area-button-secondary">
                <MapPinned size={18} aria-hidden="true" /> {hasCoordinates ? "نمایش موقعیت ثبت‌شده" : "جست‌وجو در نقشه"}
              </a>
            </div>
          </div>

          <div
            className={`area-visual-card ${hasCoordinates ? "area-visual-card-live-map" : "area-visual-card-unverified"}`}
            aria-label={`نقشهٔ موقعیت ${area.name} در اصفهان`}
          >
            {hasCoordinates ? (
              <>
                <iframe
                  className="area-map-iframe"
                  title={`نقشهٔ ${area.name}، اصفهان`}
                  src={mapEmbedUrl}
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
                <span className="area-map-label area-map-label-top">
                  <MapPinned size={15} aria-hidden="true" /> اصفهان · {area.groupTitle}
                </span>
                <div className="area-visual-caption">
                  <strong>{area.name}، اصفهان</strong>
                  <p>
                    نقطهٔ مرجع ثبت‌شده در OpenStreetMap. مرز رسمی محله در دادهٔ مکانیِ قابل تأیید موجود نیست.
                  </p>
                  <a href={geography.sourceUrl} target="_blank" rel="noopener noreferrer">
                    مشاهدهٔ منبع مختصات
                  </a>
                </div>
              </>
            ) : (
              <div className="area-map-unverified">
                <span className="area-map-unverified-icon"><MapPinned size={28} aria-hidden="true" /></span>
                <strong>موقعیت دقیق هنوز تأیید نشده است</strong>
                <p>
                  برای جلوگیری از نمایش نقطه یا مرز اشتباه، مختصات این محله تا زمان تأیید منبع معتبر نمایش داده نمی‌شود.
                </p>
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="area-button area-button-secondary">
                  جست‌وجوی نام محله در نقشه
                </a>
              </div>
            )}
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
              <strong>{hasCoordinates ? "نقطهٔ مرجع ثبت‌شده" : "مختصات در انتظار تأیید"}</strong>
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
                    ثبت درخواست فایل 
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
                  {hasCoordinates ? "نمایش در گوگل‌مپ" : "جست‌وجو در نقشه"} 
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
