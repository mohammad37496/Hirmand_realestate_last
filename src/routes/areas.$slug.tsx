import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpLeft,
  BadgeCheck,
  Building2,
  Bus,
  Compass,
  ExternalLink,
  FileText,
  MapPinned,
  Phone,
  ShoppingBag,
  Sparkles,
  Trees,
} from "lucide-react";
import { listPublishedProperties } from "@/lib/properties";
import { getNeighborhoodMarketSnapshot, type NeighborhoodMarketSnapshot } from "@/lib/neighborhood-market";
import { findAreaBySlug, areaHead, areaJsonLd, areaPath, allAreas } from "@/lib/areas";
import { breadcrumbJsonLd } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { getPublicAreaContent, type AreaContent } from "@/lib/area-content";
import areaDetailCss from "../area-detail.css?url";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { PropertyCard } from "@/components/hirmand/property-showcase";

export const Route = createFileRoute("/areas/$slug")({
  loader: async ({ params }) => {
    const area = findAreaBySlug(params.slug);
    if (!area) {
      return {
        area: null,
        properties: [] as Awaited<ReturnType<typeof listPublishedProperties>>,
        market: null as NeighborhoodMarketSnapshot | null,
        content: null as AreaContent | null,
      };
    }

    try {
      const [properties, market, content] = await Promise.all([
        listPublishedProperties({ data: { neighborhood: area.name } }),
        getNeighborhoodMarketSnapshot({ data: { neighborhood: area.name } }),
        getPublicAreaContent({ data: { slug: area.slug } }),
      ]);
      return { area, properties, market, content };
    } catch (error) {
      console.error("[area] page loader failed", error);
      return { area, properties: [], market: null, content: null };
    }
  },
  head: ({ loaderData, params }) => {
    const base = areaHead(loaderData?.area ?? null, params.slug);
    const content = loaderData?.content;
    const meta = content
      ? [
          ...base.meta.filter(
            (item) =>
              !(content.seoTitle && "title" in item) &&
              !(content.seoDescription && "name" in item && item.name === "description") &&
              !(content.heroImage && "property" in item && item.property === "og:image"),
          ),
          ...(content.seoTitle ? [{ title: content.seoTitle }] : []),
          ...(content.seoDescription ? [{ name: "description", content: content.seoDescription }] : []),
          ...(content.heroImage ? [{ property: "og:image", content: content.heroImage }] : []),
        ]
      : base.meta;
    return {
      ...base,
      meta,
      links: [...base.links, { rel: "stylesheet", href: areaDetailCss }],
    };
  },
  component: AreaPage,
});

function linesForAreaPage(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•\-–—]+/, "").trim())
    .filter(Boolean);
}

function formatFa(value: number) {
  return value.toLocaleString("fa-IR");
}

function AreaPage() {
  const { area, properties, market, content } = Route.useLoaderData();
  const highlights = content ? linesForAreaPage(content.highlights) : [];
  const amenities = content ? linesForAreaPage(content.amenities) : [];

  if (!area) {
    return (
      <SiteChrome className="area-profile-shell">
        <main className="area-profile-page">
          <section className="area-profile-not-found">
            <MapPinned size={34} aria-hidden="true" />
            <h1>این محله پیدا نشد</h1>
            <p>محلهٔ درخواستی در فهرست مناطق تحت پوشش هیرمند نیست.</p>
            <Link to="/areas/" className="area-action area-action-primary">
              مشاهدهٔ همهٔ محله‌ها <ArrowUpLeft size={16} />
            </Link>
          </section>
        </main>
      </SiteChrome>
    );
  }

  const crumbs = breadcrumbJsonLd([
    { name: "صفحه اصلی", path: "/" },
    { name: "محله‌ها", path: "/areas" },
    { name: area.name, path: areaPath(area.slug) },
  ]);

  const nearby = allAreas()
    .filter((candidate) => candidate.groupTitle === area.groupTitle && candidate.slug !== area.slug)
    .slice(0, 8);

  const areaQuery = encodeURIComponent(area.name + "، اصفهان، ایران");
  const mapsUrl =
    area.lat != null && area.lng != null
      ? "https://www.google.com/maps/search/?api=1&query=" + area.lat + "," + area.lng
      : "https://www.google.com/maps/search/?api=1&query=" + areaQuery;
  const mapEmbedUrl =
    area.lat != null && area.lng != null && area.divarBbox
      ? "https://www.openstreetmap.org/export/embed.html?bbox=" +
        area.divarBbox.map((value) => Number(value.toFixed(7))).join(",") +
        "&layer=mapnik&marker=" + area.lat + "," + area.lng
      : area.lat != null && area.lng != null
        ? "https://maps.google.com/maps?q=" + area.lat + "," + area.lng + "&z=15&hl=fa&output=embed"
        : "https://maps.google.com/maps?q=" + areaQuery + "&z=13&hl=fa&output=embed";

  const intro =
    content?.intro ||
    "برای خرید، فروش، رهن یا اجاره در محلهٔ " + area.name +
      " اصفهان، فایل‌های منتشرشده و اطلاعات موقعیت را بررسی کنید. برای دریافت گزینه‌های متناسب با بودجه و نیازتان نیز می‌توانید با مشاوران هیرمند در ارتباط باشید.";
  const about =
    content?.about ||
    "در این صفحه فایل‌های ملکی ثبت‌شده برای " + area.name +
      " را همراه با موقعیت روی نقشه و اطلاعاتی که تیم هیرمند برای این محله منتشر می‌کند مشاهده می‌کنید. جزئیات امکانات و ویژگی‌های محله پس از ثبت و انتشار از بخش «اطلاعات محله‌ها» به همین صفحه اضافه می‌شود.";

  return (
    <SiteChrome className="area-profile-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(areaJsonLd(area)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }}
      />

      <main className="area-profile-page">
        <nav className="area-profile-breadcrumbs" aria-label="مسیر صفحه">
          <Link to="/">صفحهٔ اصلی</Link>
          <span aria-hidden="true">/</span>
          <Link to="/areas/">راهنمای محله‌ها</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{area.name}</span>
        </nav>

        <header className={"area-profile-hero" + (content?.heroImage ? " has-image" : "")}>
          <div className="area-profile-hero-copy">
            <span className="area-profile-eyebrow">
              <span className="area-profile-eyebrow-dot" />
              راهنمای محله‌های اصفهان
            </span>
            <div className="area-profile-location-line">
              <MapPinned size={16} aria-hidden="true" />
              <span>{area.groupTitle}</span>
              <span className="area-profile-location-divider" aria-hidden="true">·</span>
              <span>اصفهان</span>
            </div>
            <h1>املاک {area.name}</h1>
            <p>{intro}</p>
            <div className="area-profile-hero-actions">
              <a href="#area-listings" className="area-action area-action-primary">
                <Building2 size={17} aria-hidden="true" /> فایل‌های این محله
              </a>
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="area-action area-action-secondary">
                <MapPinned size={17} aria-hidden="true" /> مشاهده روی نقشه <ExternalLink size={13} aria-hidden="true" />
              </a>
            </div>
            <div className="area-profile-trust-line">
              <BadgeCheck size={16} aria-hidden="true" />
              <span>صفحهٔ اختصاصی محله در وب‌سایت گروه مشاورین املاک هیرمند</span>
            </div>
          </div>

          {content?.heroImage ? (
            <div className="area-profile-hero-media">
              <img src={content.heroImage} alt={"نمای منتخب محلهٔ " + area.name} loading="eager" />
              <span className="area-profile-image-caption">راهنمای محلهٔ {area.name}</span>
            </div>
          ) : (
            <div className="area-profile-hero-art" aria-label={"راهنمای محله " + area.name}>
              <div className="area-profile-art-topline">
                <span><Compass size={15} aria-hidden="true" /> راهنمای محلی هیرمند</span>
                <span className="area-profile-art-dot" />
              </div>
              <div className="area-profile-art-map" aria-hidden="true">
                <span className="area-profile-road area-profile-road-one" />
                <span className="area-profile-road area-profile-road-two" />
                <span className="area-profile-road area-profile-road-three" />
                <span className="area-profile-block area-profile-block-one" />
                <span className="area-profile-block area-profile-block-two" />
                <span className="area-profile-block area-profile-block-three" />
                <span className="area-profile-block area-profile-block-four" />
                <span className="area-profile-map-pin"><MapPinned size={24} /></span>
              </div>
              <div className="area-profile-art-label">
                <strong>{area.name}</strong>
                <span>{area.groupTitle}</span>
              </div>
              <p>معرفی محله، موقعیت و فایل‌های ملکی در یک نگاه</p>
            </div>
          )}
        </header>

        <section className="area-profile-stats" aria-label="خلاصهٔ محله">
          <div className="area-profile-stat">
            <span className="area-profile-stat-icon"><Building2 size={18} aria-hidden="true" /></span>
            <span className="area-profile-stat-copy"><small>فایل منتشرشده</small><strong>{formatFa(properties.length)}</strong></span>
          </div>
          <div className="area-profile-stat">
            <span className="area-profile-stat-icon"><MapPinned size={18} aria-hidden="true" /></span>
            <span className="area-profile-stat-copy"><small>محدوده</small><strong>{area.groupTitle}</strong></span>
          </div>
          <div className="area-profile-stat">
            <span className="area-profile-stat-icon"><FileText size={18} aria-hidden="true" /></span>
            <span className="area-profile-stat-copy"><small>تصاویر ثبت‌شده</small><strong>{formatFa(content?.gallery.length ?? 0)}</strong></span>
          </div>
          <div className="area-profile-stat">
            <span className="area-profile-stat-icon"><Phone size={18} aria-hidden="true" /></span>
            <span className="area-profile-stat-copy"><small>مشاوره محلی</small><strong>با هماهنگی</strong></span>
          </div>
        </section>

        <nav className="area-profile-section-nav" aria-label="بخش‌های صفحه">
          <a href="#area-about">دربارهٔ محله</a>
          {(highlights.length > 0 || amenities.length > 0 || content?.transportation) ? <a href="#area-features">ویژگی‌ها و دسترسی</a> : null}
          <a href="#area-map">نقشه و موقعیت</a>
          {content?.gallery.length ? <a href="#area-gallery">گالری تصاویر</a> : null}
          <a href="#area-listings">فایل‌های ملکی</a>
        </nav>

        <section className="area-profile-about-grid" id="area-about">
          <article className="area-profile-panel area-profile-about">
            <span className="area-profile-section-kicker"><Sparkles size={15} aria-hidden="true" /> آشنایی با محله</span>
            <h2>دربارهٔ محلهٔ {area.name}</h2>
            <p>{about}</p>
            {content?.marketNote ? (
              <div className="area-profile-expert-note">
                <span>یادداشت تیم هیرمند</span>
                <p>{content.marketNote}</p>
              </div>
            ) : null}
          </article>
          <aside className="area-profile-contact-panel">
            <span className="area-profile-contact-icon"><Phone size={20} aria-hidden="true" /></span>
            <span className="area-profile-section-kicker">مشاورهٔ محلی</span>
            <h2>برای انتخاب بهتر، مشورت کنید.</h2>
            <p>برای دریافت فایل‌های متناسب با بودجه و شرایطتان در {area.name} با مشاوران هیرمند صحبت کنید.</p>
            <a href={"tel:" + SITE.phone.mobile} className="area-action area-action-primary">
              <Phone size={16} aria-hidden="true" /> تماس با مشاور
            </a>
            <Link to="/" hash="inquiry" className="area-action area-action-secondary">
              ثبت درخواست ملک <ArrowUpLeft size={15} aria-hidden="true" />
            </Link>
          </aside>
        </section>

        {(highlights.length > 0 || amenities.length > 0 || content?.transportation) ? (
          <section className="area-profile-section" id="area-features">
            <div className="area-profile-section-heading">
              <div>
                <span className="area-profile-section-kicker">راهنمای زندگی در محله</span>
                <h2>ویژگی‌ها و دسترسی‌های {area.name}</h2>
              </div>
              <p>این اطلاعات بر اساس محتوایی نمایش داده می‌شود که برای همین محله در پنل ثبت و منتشر کرده‌اید.</p>
            </div>
            <div className="area-profile-feature-grid">
              {highlights.length ? (
                <article className="area-profile-panel">
                  <span className="area-profile-feature-icon"><Sparkles size={19} aria-hidden="true" /></span>
                  <h3>ویژگی‌های شاخص</h3>
                  <ul>{highlights.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </article>
              ) : null}
              {amenities.length ? (
                <article className="area-profile-panel">
                  <span className="area-profile-feature-icon"><ShoppingBag size={19} aria-hidden="true" /></span>
                  <h3>امکانات و خدمات اطراف</h3>
                  <ul>{amenities.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </article>
              ) : null}
              {content?.transportation ? (
                <article className="area-profile-panel area-profile-transport-card">
                  <span className="area-profile-feature-icon"><Bus size={19} aria-hidden="true" /></span>
                  <h3>دسترسی و حمل‌ونقل</h3>
                  <p>{content.transportation}</p>
                </article>
              ) : null}
            </div>
          </section>
        ) : null}

        {market ? (
          <section className="area-profile-market-section">
            <div className="area-profile-section-heading">
              <div>
                <span className="area-profile-section-kicker">داده‌های داخلی سایت</span>
                <h2>نبض بازار ملک در {area.name}</h2>
              </div>
              <p>آمار حاصل از فایل‌ها و تعاملات ثبت‌شده در سایت هیرمند است؛ قیمت یا برآوردی خارج از داده‌های موجود نمایش داده نمی‌شود.</p>
            </div>
            <div className="area-profile-market-grid">
              {[
                ["فایل فعال", formatFa(market.activeFiles)],
                ["فایل فروش", formatFa(market.saleFiles)],
                ["رهن و اجاره", formatFa(market.rentFiles)],
                ["فایل جدید در ۳۰ روز", formatFa(market.newFiles30d)],
              ].map(([label, value]) => (
                <div className="area-profile-market-stat" key={label}>
                  <span>{label}</span><strong>{value}</strong>
                </div>
              ))}
            </div>
            {(market.saleAvgPerM2 != null || market.rentAvg != null) ? (
              <p className="area-profile-market-footnote">
                {market.saleAvgPerM2 != null ? <>میانگین ثبت‌شدهٔ قیمت فروش هر متر: <strong>{formatFa(market.saleAvgPerM2)} تومان</strong>{market.rentAvg != null ? " · " : " ."}</> : null}
                {market.rentAvg != null ? <>میانگین ثبت‌شدهٔ اجاره: <strong>{formatFa(market.rentAvg)} تومان</strong>.</> : null}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="area-profile-section" id="area-map">
          <div className="area-profile-section-heading">
            <div>
              <span className="area-profile-section-kicker">موقعیت مکانی</span>
              <h2>محلهٔ {area.name} روی نقشه</h2>
            </div>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="area-profile-text-link">
              باز کردن نقشهٔ بزرگ‌تر <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
          <div className="area-profile-map-card">
            <iframe
              title={"نقشهٔ محلهٔ " + area.name + " در اصفهان"}
              src={mapEmbedUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
            <div className="area-profile-map-caption">
              <span className="area-profile-map-caption-icon"><MapPinned size={18} aria-hidden="true" /></span>
              <div>
                <strong>{area.name}، اصفهان</strong>
                <p>{area.lat == null || area.lng == null
                  ? "مختصات ثابت تأییدشده برای این نام ثبت نشده است؛ نقشه بر اساس جست‌وجوی نام محله نمایش داده می‌شود."
                  : "مرکز تقریبی ثبت‌شده: " + area.lat.toFixed(5) + "، " + area.lng.toFixed(5) + ". این نقطه لزوماً مرز رسمی محله نیست."}</p>
              </div>
            </div>
          </div>
        </section>

        {content?.gallery.length ? (
          <section className="area-profile-section" id="area-gallery">
            <div className="area-profile-section-heading">
              <div>
                <span className="area-profile-section-kicker">تصاویر منتخب</span>
                <h2>گالری محلهٔ {area.name}</h2>
              </div>
              <p>تصاویری که برای همین محله از بخش اطلاعات محله‌ها آپلود کرده‌اید.</p>
            </div>
            <div className="area-profile-gallery">
              {content.gallery.map((url, index) => (
                <a key={url + "-" + index} href={url} target="_blank" rel="noreferrer" aria-label={"نمایش تصویر " + formatFa(index + 1) + " از محلهٔ " + area.name}>
                  <img src={url} alt={"تصویر " + formatFa(index + 1) + " از محلهٔ " + area.name} loading="lazy" />
                  <span>{formatFa(index + 1).padStart(2, "۰")}</span>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <section className="area-profile-section" id="area-listings">
          <div className="area-profile-section-heading">
            <div>
              <span className="area-profile-section-kicker">فایل‌های هیرمند</span>
              <h2>ملک‌های منتشرشده در {area.name}</h2>
            </div>
            <Link to="/properties" className="area-profile-text-link">
              همهٔ فایل‌ها <ArrowUpLeft size={15} aria-hidden="true" />
            </Link>
          </div>
          {properties.length ? (
            <div className="area-profile-listings">
              {properties.map((property) => <PropertyCard key={property.id} property={property} />)}
            </div>
          ) : (
            <div className="area-profile-empty-listings">
              <span><Building2 size={23} aria-hidden="true" /></span>
              <h3>فعلاً فایل منتشرشده‌ای در این محله نداریم.</h3>
              <p>برای اطلاع از فایل‌های جدید یا معرفی گزینه‌های مشابه در محدوده‌های نزدیک، با مشاوران هیرمند تماس بگیرید.</p>
              <a href={"tel:" + SITE.phone.mobile} className="area-action area-action-primary"><Phone size={16} aria-hidden="true" /> تماس با هیرمند</a>
            </div>
          )}
        </section>

        {nearby.length ? (
          <section className="area-profile-section area-profile-nearby-section">
            <div className="area-profile-section-heading">
              <div>
                <span className="area-profile-section-kicker">محدوده‌های هم‌گروه</span>
                <h2>محله‌های دیگر در {area.groupTitle}</h2>
              </div>
              <Link to="/areas/" className="area-profile-text-link">فهرست کامل محله‌ها <ArrowUpLeft size={15} aria-hidden="true" /></Link>
            </div>
            <div className="area-profile-nearby-grid">
              {nearby.map((candidate) => (
                <Link key={candidate.slug} to="/areas/$slug" params={{ slug: candidate.slug }} className="area-profile-nearby-card">
                  <span className="area-profile-nearby-icon"><Trees size={18} aria-hidden="true" /></span>
                  <span className="area-profile-nearby-copy"><strong>{candidate.name}</strong><small>{candidate.groupTitle}</small></span>
                  <ArrowRight size={16} aria-hidden="true" className="area-profile-nearby-arrow" />
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="area-profile-final-cta">
          <div className="area-profile-final-cta-icon"><Phone size={22} aria-hidden="true" /></div>
          <div>
            <span>همراه شما برای انتخاب خانه‌ای بهتر</span>
            <h2>برای خرید یا اجاره در {area.name}، با ما گفت‌وگو کنید.</h2>
            <p>نیازها و بودجه‌تان را مطرح کنید تا برای بررسی فایل‌های مناسب راهنمایی بگیرید.</p>
          </div>
          <div className="area-profile-final-cta-actions">
            <a href={"tel:" + SITE.phone.mobile} className="area-action area-action-primary"><Phone size={16} aria-hidden="true" /> تماس با دفتر</a>
            <Link to="/" hash="inquiry" className="area-action area-action-secondary">ثبت درخواست <ArrowUpLeft size={15} aria-hidden="true" /></Link>
          </div>
        </section>
      </main>
    </SiteChrome>
  );
}
