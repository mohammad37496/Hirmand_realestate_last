import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpLeft,
  Building2,
  CheckCircle2,
  Home,
  MapPinned,
  Phone,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { listPublishedProperties } from "@/lib/properties";
import { getNeighborhoodMarketSnapshot, type NeighborhoodMarketSnapshot } from "@/lib/neighborhood-market";
import { findAreaBySlug, areaHead, areaJsonLd, areaPath, allAreas, mergeAreasWithDivarCatalog } from "@/lib/areas";
import { listStoredDivarNeighborhoodCatalog } from "@/lib/divar-neighborhoods";
import { breadcrumbJsonLd } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { PropertyCard } from "@/components/hirmand/property-showcase";

export const Route = createFileRoute("/areas/$slug")({
  loader: async ({ params }) => {
    let directoryAreas = allAreas();
    try {
      const catalog = await listStoredDivarNeighborhoodCatalog();
      directoryAreas = mergeAreasWithDivarCatalog(catalog.items);
    } catch (error) {
      console.warn("[area] stored neighborhood catalog unavailable; using Hirmand's local list", error);
    }

    // Prefer the catalog-enriched entry first: the curated list may have the same
    // slug but lacks Divar coordinates and bbox, which would hide the map.
    const foundArea = directoryAreas.find((candidate) => candidate.slug === params.slug)
      ?? findAreaBySlug(params.slug)
      ?? null;

    if (!foundArea) {
      return {
        area: null,
        directoryAreas,
        properties: [] as Awaited<ReturnType<typeof listPublishedProperties>>,
        market: null as NeighborhoodMarketSnapshot | null,
      };
    }

    const area = foundArea;
    try {
      const [properties, market] = await Promise.all([
        listPublishedProperties({ data: { neighborhood: area.name } }),
        getNeighborhoodMarketSnapshot({ data: { neighborhood: area.name } }),
      ]);
      return { area, directoryAreas, properties, market };
    } catch (error) {
      console.error("[area] properties loader failed", error);
      return { area, directoryAreas, properties: [], market: null };
    }
  },
  head: ({ loaderData, params }) => areaHead(loaderData?.area ?? null, params.slug),
  component: AreaPage,
});

function AreaPage() {
  const { area, directoryAreas, properties, market } = Route.useLoaderData();

  if (!area) {
    return (
      <SiteChrome className="property-detail-shell area-page-shell">
        <main className="area-page">
          <section className="area-not-found">
            <div className="area-not-found-icon"><MapPinned size={28} /></div>
            <span className="area-eyebrow">راهنمای محله‌های هیرمند</span>
            <h1>این محله پیدا نشد</h1>
            <p>محله درخواستی در فهرست مناطق تحت پوشش هیرمند نیست.</p>
            <Link to="/areas" className="btn-gold">
              <ArrowRight size={17} /> مشاهده محله‌ها
            </Link>
          </section>
        </main>
      </SiteChrome>
    );
  }

  const crumbs = breadcrumbJsonLd([
    { name: "صفحه اصلی", path: "/" },
    { name: "محله‌ها", path: "/#areas" },
    { name: area.name, path: areaPath(area.slug) },
  ]);

  const nearby = directoryAreas
    .filter((candidate) => candidate.groupTitle === area.groupTitle && candidate.slug !== area.slug)
    .slice(0, 8);

  const mapsUrl = area.lat != null && area.lng != null
    ? "https://www.google.com/maps/search/?api=1&query=" + area.lat + "," + area.lng
    : null;
  const divarMapUrl = area.divarBbox && area.lat != null && area.lng != null
    ? "https://www.openstreetmap.org/export/embed.html?bbox=" + encodeURIComponent(area.divarBbox.join(",")) + "&layer=mapnik&marker=" + area.lat + "%2C" + area.lng
    : null;

  return (
    <SiteChrome className="property-detail-shell area-page-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(areaJsonLd(area)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }}
      />

      <main className="area-page">
        <nav aria-label="مسیر صفحه" className="area-breadcrumbs">
          <Link to="/">صفحه اصلی</Link>
          <span aria-hidden="true">/</span>
          <Link to="/areas">محله‌ها</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{area.name}</span>
        </nav>

        <section className="area-hero" aria-labelledby="area-title">
          <div className="area-hero-copy">
            <div className="area-eyebrow">
              <span className="area-eyebrow-mark" />
              راهنمای خرید و اجاره ملک در اصفهان
            </div>
            <div className="area-context">
              <MapPinned size={15} />
              <span>اصفهان</span>
              <span className="area-context-separator" />
              <span>{area.groupTitle}</span>
            </div>
            <h1 id="area-title">
              خرید، فروش و اجاره ملک در <span>{area.name}</span>
            </h1>
            <p className="area-hero-description">
              فایل‌های ملکی محله {area.name} را بررسی کنید و برای انتخاب خانه، آپارتمان یا ملک مناسب،
              از راهنمایی گروه مشاورین املاک هیرمند کمک بگیرید.
            </p>
            <div className="area-hero-actions">
              <a href="#area-properties" className="btn-gold">
                <Building2 size={18} /> دیدن فایل‌های این محله
              </a>
              <a href={"tel:" + SITE.phone.mobile} className="btn-ghost">
                <Phone size={17} /> مشاوره تلفنی
              </a>
            </div>
            <div className="area-trust-note">
              <CheckCircle2 size={16} />
              <span>فهرست زیر از فایل‌های منتشرشده در سایت هیرمند نمایش داده می‌شود.</span>
            </div>

            <div className="area-hero-stats" aria-label="خلاصه فایل‌های محله">
              <div className="area-hero-stat area-hero-stat-primary">
                <span>فایل قابل مشاهده</span>
                <strong>{properties.length.toLocaleString("fa-IR")}</strong>
              </div>
              <div className="area-hero-stat">
                <span>فایل فروش</span>
                <strong>{market ? market.saleFiles.toLocaleString("fa-IR") : "—"}</strong>
              </div>
              <div className="area-hero-stat">
                <span>رهن و اجاره</span>
                <strong>{market ? market.rentFiles.toLocaleString("fa-IR") : "—"}</strong>
              </div>
            </div>
          </div>

          <div className="area-hero-aside">
            <figure className="area-hero-visual">
              <img
                src="/images/isfahan-hero.jpg"
                alt="نمایی از معماری و فضای شهری اصفهان"
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
              <div className="area-visual-overlay" aria-hidden="true" />
              <div className="area-visual-topline">
                <span className="area-visual-mark"><MapPinned size={18} /></span>
                <span className="area-visual-brand">راهنمای محله‌های هیرمند</span>
                <span className="area-visual-city">اصفهان</span>
              </div>
              <figcaption className="area-visual-caption">
                <span className="area-visual-kicker"><Sparkles size={13} /> انتخاب آگاهانه، از شناخت محله شروع می‌شود</span>
                <h2>{area.name}</h2>
                <p>راهنمای بررسی فایل‌های خرید، فروش و اجاره در این محدوده</p>
              </figcaption>
              <a href="#area-properties" className="area-visual-count" aria-label="مشاهده فایل‌های ملکی این محله">
                <span className="area-visual-count-icon"><Home size={18} /></span>
                <span className="area-visual-count-copy">
                  <small>فایل‌های قابل مشاهده در سایت</small>
                  <strong>{properties.length.toLocaleString("fa-IR")} <span>فایل</span></strong>
                </span>
                <span className="area-visual-count-arrow"><ArrowUpLeft size={19} /></span>
              </a>
              <span className="area-visual-index" aria-hidden="true">HIRMAND / ISFAHAN</span>
            </figure>
          </div>
        </section>

        {market ? (
          <section className="area-market" aria-labelledby="area-market-title">
            <div className="area-section-heading area-market-heading">
              <div>
                <span className="area-section-kicker"><TrendingUp size={15} /> داده‌های سایت هیرمند</span>
                <h2 id="area-market-title">نبض بازار {area.name}</h2>
                <p>خلاصه‌ای از فایل‌ها و تعامل‌های ثبت‌شده برای این محله</p>
              </div>
              <span className="area-market-period">۳۰ روز اخیر و فایل‌های فعال</span>
            </div>
            <div className="area-market-grid">
              {[
                ["فایل فعال", market.activeFiles.toLocaleString("fa-IR"), "منتشرشده در سایت"],
                ["فروش", market.saleFiles.toLocaleString("fa-IR"), "فایل فروش"],
                ["رهن و اجاره", market.rentFiles.toLocaleString("fa-IR"), "فایل اجاره"],
                ["فایل جدید", market.newFiles30d.toLocaleString("fa-IR"), "در ۳۰ روز اخیر"],
                ["کاهش قیمت", market.priceDropFiles.toLocaleString("fa-IR"), "تغییر قیمت ثبت‌شده"],
                ["بازدید صفحه", market.views30d.toLocaleString("fa-IR"), "در ۳۰ روز اخیر"],
              ].map(([label, value, note], index) => (
                <div className={"area-market-item" + (index === 0 ? " area-market-item-emphasis" : "")} key={label}>
                  <span className="area-market-label">{label}</span>
                  <strong>{value}</strong>
                  <small>{note}</small>
                </div>
              ))}
            </div>
            {market.saleAvgPerM2 != null || market.rentAvg != null ? (
              <div className="area-market-prices">
                {market.saleAvgPerM2 != null ? (
                  <p>میانگین تقریبی قیمت فروش هر متر: <strong>{market.saleAvgPerM2.toLocaleString("fa-IR")} تومان</strong></p>
                ) : null}
                {market.rentAvg != null ? (
                  <p>میانگین اجاره ثبت‌شده: <strong>{market.rentAvg.toLocaleString("fa-IR")} تومان</strong></p>
                ) : null}
              </div>
            ) : null}
            <p className="area-market-footnote">
              در ۳۰ روز اخیر {market.favorites30d.toLocaleString("fa-IR")} ذخیره، {market.calls30d.toLocaleString("fa-IR")} تماس یا واتساپ و {market.viewingRequests30d.toLocaleString("fa-IR")} درخواست بازدید ثبت شده است.
            </p>
          </section>
        ) : null}

        <div className="area-content-layout">
          <div className="area-content-main">
            <section id="area-properties" className="area-listings" aria-labelledby="area-properties-title">
              <div className="area-section-heading area-listings-heading">
                <div>
                  <span className="area-section-kicker"><Building2 size={15} /> فایل‌های هیرمند</span>
                  <h2 id="area-properties-title">ملک‌های موجود در {area.name}</h2>
                  <p>برای دیدن جزئیات، تصاویر و اطلاعات هر فایل، آن را انتخاب کنید.</p>
                </div>
                <span className="area-listing-count">{properties.length.toLocaleString("fa-IR")} فایل</span>
              </div>

              {properties.length ? (
                <div className="property-grid area-property-grid">
                  {properties.map((property) => (
                    <PropertyCard key={property.id} property={property} />
                  ))}
                </div>
              ) : (
                <div className="area-empty-state">
                  <div className="area-empty-icon"><Building2 size={25} /></div>
                  <h3>فعلاً فایلی برای این محله منتشر نشده است</h3>
                  <p>
                    برای اطلاع از فایل‌های تازه یا دریافت پیشنهادهای نزدیک به محدوده {area.name}،
                    درخواستتان را ثبت کنید یا با دفتر هیرمند تماس بگیرید.
                  </p>
                  <div className="area-empty-actions">
                    <Link to="/" hash="inquiry" className="btn-gold">درخواست فایل ملک</Link>
                    <a href={"tel:" + SITE.phone.mobile} className="btn-ghost"><Phone size={16} /> تماس با دفتر</a>
                  </div>
                </div>
              )}
            </section>

            {nearby.length ? (
              <section className="area-nearby" aria-labelledby="area-nearby-title">
                <div className="area-section-heading">
                  <div>
                    <span className="area-section-kicker">برای بررسی بیشتر</span>
                    <h2 id="area-nearby-title">محله‌های دیگر در {area.groupTitle}</h2>
                  </div>
                </div>
                <div className="area-nearby-grid">
                  {nearby.map((candidate) => (
                    <Link
                      key={candidate.slug}
                      to="/areas/$slug"
                      params={{ slug: candidate.slug }}
                      className="area-nearby-link"
                    >
                      <span>{candidate.name}</span>
                      <ArrowUpLeft size={16} />
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="area-sidebar">
            <section className="area-contact-card" aria-labelledby="area-contact-title">
              <div className="area-contact-icon"><Phone size={21} /></div>
              <span className="area-contact-kicker">همراه شما در انتخاب ملک</span>
              <h2 id="area-contact-title">برای محله {area.name} راهنمایی می‌خواهید؟</h2>
              <p>برای هماهنگی بازدید یا دریافت فایل‌های متناسب با نیازتان با مشاوران هیرمند در ارتباط باشید.</p>
              <a href={"tel:" + SITE.phone.mobile} className="btn-gold">
                <Phone size={17} /> تماس با دفتر
              </a>
              <Link to="/" hash="inquiry" className="btn-ghost">ثبت درخواست ملک</Link>
              <div className="area-contact-note">
                <CheckCircle2 size={15} />
                <span>پیش از بازدید، جزئیات فایل را با مشاور هماهنگ کنید.</span>
              </div>
            </section>

            <section id="area-location" className="area-location-card" aria-labelledby="area-location-title">
              <div className="area-location-card-heading">
                <div className="area-location-icon"><MapPinned size={20} /></div>
                <div>
                  <span className="area-section-kicker">اطلاعات جغرافیایی</span>
                  <h2 id="area-location-title">موقعیت محله</h2>
                </div>
              </div>
              <p className="area-location-name">{area.name}، اصفهان</p>
              {area.divarDistrictId && area.lat != null && area.lng != null ? (
                <p className="area-location-detail">
                  مرکز ثبت‌شده این محدوده: {area.lat.toFixed(5)}، {area.lng.toFixed(5)}
                </p>
              ) : (
                <p className="area-location-detail">
                  برای جلوگیری از نمایش موقعیت نادرست، نقشه فقط پس از پیدا شدن تطبیق یکتای محدوده نمایش داده می‌شود.
                </p>
              )}
              {divarMapUrl ? (
                <iframe
                  title={"نقشه محدوده " + area.name}
                  src={divarMapUrl}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="area-location-map"
                />
              ) : (
                <div className="area-map-placeholder">
                  <MapPinned size={27} />
                  <span>نقشه این محدوده در دسترس نیست</span>
                  <small>اطلاعات مکانی معتبر هنوز تأیید نشده است.</small>
                </div>
              )}
              {mapsUrl ? (
                <a className="area-map-external" href={mapsUrl} target="_blank" rel="noopener noreferrer">
                  باز کردن مرکز ثبت‌شده در گوگل‌مپ <ArrowUpLeft size={16} />
                </a>
              ) : null}
              {area.divarBbox ? (
                <small className="area-map-note">
                  محدوده نمایش‌داده‌شده بر پایه کادر جغرافیایی منبع است و مرز رسمی چندضلعی محسوب نمی‌شود.
                </small>
              ) : null}
            </section>
          </aside>
        </div>
      </main>
    </SiteChrome>
  );
}
