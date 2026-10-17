import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MapPinned, Phone } from "lucide-react";
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
    if (!area) return {
      area: null,
      properties: [] as Awaited<ReturnType<typeof listPublishedProperties>>,
      market: null as NeighborhoodMarketSnapshot | null,
      content: null as AreaContent | null,
    };
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
    const meta = content ? [
      ...base.meta.filter((item) => !(content.seoTitle && "title" in item) && !(content.seoDescription && "name" in item && item.name === "description")),
      ...(content.seoTitle ? [{ title: content.seoTitle }] : []),
      ...(content.seoDescription ? [{ name: "description", content: content.seoDescription }] : []),
    ] : base.meta;
    return { ...base, meta, links: [...base.links, { rel: "stylesheet", href: areaDetailCss }] };
  },
  component: AreaPage,
});

function linesForAreaPage(value: string) {
  return value.split(/\r?\n/).map((line) => line.replace(/^[\s•\-–—]+/, "").trim()).filter(Boolean);
}

function AreaPage() {
  const { area, properties, market, content } = Route.useLoaderData();
  const highlights = content ? linesForAreaPage(content.highlights) : [];
  const amenities = content ? linesForAreaPage(content.amenities) : [];

  if (!area) {
    return (
      <SiteChrome className="property-detail-shell">
        <section className="property-not-found">
          <MapPinned size={32} />
          <h1>این محله پیدا نشد</h1>
          <p>محله درخواستی در فهرست مناطق تحت پوشش هیرمند نیست.</p>
          <Link to="/" hash="areas" className="btn-gold">
            مشاهده محله‌ها
          </Link>
        </section>
      </SiteChrome>
    );
  }

  const crumbs = breadcrumbJsonLd([
    { name: "صفحه اصلی", path: "/" },
    { name: "محله‌ها", path: "/#areas" },
    { name: area.name, path: areaPath(area.slug) },
  ]);

  const nearby = allAreas()
    .filter((a) => a.groupTitle === area.groupTitle && a.slug !== area.slug)
    .slice(0, 8);

  const areaQuery = encodeURIComponent(`${area.name}، اصفهان، ایران`);
  const mapsUrl = area.lat != null && area.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${area.lat},${area.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${areaQuery}`;
  const mapEmbedUrl = area.lat != null && area.lng != null && area.divarBbox
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${area.divarBbox.map((value) => Number(value.toFixed(7))).join(",")}&layer=mapnik&marker=${area.lat},${area.lng}`
    : area.lat != null && area.lng != null
      ? `https://maps.google.com/maps?q=${area.lat},${area.lng}&z=15&hl=fa&output=embed`
      : `https://maps.google.com/maps?q=${areaQuery}&z=13&hl=fa&output=embed`;

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

      <main className="property-detail">
        <nav
          aria-label="مسیر صفحه"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
            fontSize: "0.82rem",
            color: "var(--subtle)",
          }}
        >
          <Link to="/" style={{ color: "var(--muted)" }}>
            صفحه اصلی
          </Link>
          <span>/</span>
          <Link to="/" hash="areas" style={{ color: "var(--muted)" }}>
            محله‌ها
          </Link>
          <span>/</span>
          <span>{area.name}</span>
        </nav>

        <div className="property-detail-top">
          <Link to="/" hash="areas" className="back-link">
            <ArrowRight size={17} /> همه محله‌ها
          </Link>
          <span className="property-detail-code">{area.groupTitle}</span>
        </div>

        <section className={"area-editorial-hero" + (content?.heroImage ? " has-image" : "")}>
          <div className="area-editorial-hero-copy">
            <span className="area-editorial-eyebrow">راهنمای محله‌های اصفهان · {area.groupTitle}</span>
            <h1>املاک {area.name} اصفهان</h1>
            <p>{content?.intro || ("برای خرید، فروش، رهن یا اجاره ملک در " + area.name + " اصفهان، فایل‌های فعال، موقعیت محله و راهنمای محلی هیرمند را در همین صفحه بررسی کنید.")}</p>
          </div>
          {content?.heroImage ? <img className="area-editorial-hero-image" src={content.heroImage} alt={"نمای محله " + area.name} loading="eager" /> : null}
        </section>

        <div className="property-detail-grid">
          <div className="property-detail-main">
            <div className="pcard-meta">
              <span>اصفهان</span>
              <span>{area.groupTitle}</span>
            </div>
            <h2 className="area-property-heading">فایل‌های ملکی در {area.name}</h2>
            <p className="property-detail-description">
              خرید، فروش، رهن و اجاره ملک در محله <strong>{area.name}</strong> اصفهان با همراهی
              گروه مشاورین املاک هیرمند. فایل‌های به‌روز این محله را در همین صفحه ببینید یا برای
              مشاوره اختصاصی با دفتر تماس بگیرید.
            </p>

            <div className="property-address">
              <MapPinned size={20} />
              <div>
                <strong>موقعیت روی نقشه</strong>
                <p>
                  {area.name} — {area.lat == null || area.lng == null
                    ? "مرکز مختصات تأییدشده برای این نام ثبت نشده است."
                    : `مرکز تقریبی: ${area.lat.toFixed(5)}، ${area.lng.toFixed(5)}`}
                </p>
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                  {area.lat == null || area.lng == null ? "جستجوی محدوده در گوگل‌مپ" : "باز کردن مرکز محدوده در گوگل‌مپ"}
                </a>
              </div>
            </div>
            <section aria-label={`نقشهٔ ${area.name}`} style={{ marginTop: 18 }}>
              <iframe
                title={`نقشهٔ ${area.name} در اصفهان`}
                src={mapEmbedUrl}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                style={{ display: "block", width: "100%", height: "clamp(280px, 40vw, 430px)", border: "1px solid var(--line)", borderRadius: 18, background: "var(--card)" }}
              />
              <p style={{ margin: "9px 2px 0", fontSize: ".82rem", lineHeight: 1.9, color: "var(--subtle)" }}>
                {area.divarDistrictId && area.divarBbox
                  ? "مرکز و گسترهٔ تقریبی از کاتالوگ ذخیره‌شدهٔ دیوار آمده است؛ دادهٔ موجود مرز رسمی چندضلعی را ندارد."
                  : "برای این نام، مختصات ثابت تأییدشده در کاتالوگ نداریم؛ نقشه بر اساس جستجوی نام نمایش داده می‌شود."}
              </p>
            </section>

            {content && (content.about || highlights.length || amenities.length || content.transportation || content.marketNote) ? (
              <section className="area-editorial-sections" aria-label={"راهنمای محلی " + area.name}>
                {content.about ? (
                  <article className="area-editorial-card wide">
                    <h2>دربارهٔ محلهٔ {area.name}</h2>
                    <p>{content.about}</p>
                  </article>
                ) : null}
                {highlights.length ? (
                  <article className="area-editorial-card">
                    <h2>ویژگی‌های شاخص محله</h2>
                    <ul>{highlights.map((item, index) => <li key={index}>{item}</li>)}</ul>
                  </article>
                ) : null}
                {amenities.length ? (
                  <article className="area-editorial-card">
                    <h2>امکانات و خدمات اطراف</h2>
                    <ul>{amenities.map((item, index) => <li key={index}>{item}</li>)}</ul>
                  </article>
                ) : null}
                {content.transportation ? (
                  <article className="area-editorial-card">
                    <h2>دسترسی و حمل‌ونقل</h2>
                    <p>{content.transportation}</p>
                  </article>
                ) : null}
                {content.marketNote ? (
                  <article className="area-editorial-card">
                    <h2>نگاهی به بازار ملک</h2>
                    <p>{content.marketNote}</p>
                  </article>
                ) : null}
              </section>
            ) : null}

            {content?.gallery.length ? (
              <section className="area-photo-gallery" aria-label={"تصاویر محله " + area.name}>
                <div className="area-photo-gallery-head">
                  <div><h2>گالری تصاویر {area.name}</h2><p>تصاویر منتخب این محله از سوی گروه هیرمند</p></div>
                </div>
                <div className="area-photo-gallery-grid">
                  {content.gallery.map((url, index) => (
                    <a key={url + "-" + index} href={url} target="_blank" rel="noreferrer" aria-label={"نمایش تصویر " + (index + 1).toLocaleString("fa-IR") + " از " + area.name}>
                      <img src={url} alt={"تصویر " + (index + 1).toLocaleString("fa-IR") + " از محله " + area.name} loading="lazy" />
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            {market ? (
              <section style={{ marginTop: 28, padding: 18, border: "1px solid var(--line)", borderRadius: 20, background: "var(--card)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div>
                    <span className="kicker">تصویر بازار داخلی هیرمند</span>
                    <h2 style={{ fontSize: "1.15rem", margin: "4px 0 0" }}>نبض بازار {area.name}</h2>
                  </div>
                  <small style={{ color: "var(--subtle)" }}>فایل‌های منتشرشده و رفتار ۳۰ روز اخیر سایت</small>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 10, marginTop: 14 }}>
                  {[
                    ["فایل فعال", market.activeFiles.toLocaleString("fa-IR")],
                    ["فروش", market.saleFiles.toLocaleString("fa-IR")],
                    ["رهن و اجاره", market.rentFiles.toLocaleString("fa-IR")],
                    ["فایل جدید ۳۰ روزه", market.newFiles30d.toLocaleString("fa-IR")],
                    ["کاهش قیمت", market.priceDropFiles.toLocaleString("fa-IR")],
                    ["بازدید ۳۰ روزه", market.views30d.toLocaleString("fa-IR")],
                  ].map(([label, value]) => (
                    <div key={label} style={{ padding: 12, borderRadius: 14, background: "var(--card-2)", border: "1px solid var(--line)" }}>
                      <span style={{ display: "block", color: "var(--subtle)", fontSize: ".72rem" }}>{label}</span>
                      <strong style={{ display: "block", marginTop: 5, fontSize: "1.02rem", color: "var(--navy-900)" }}>{value}</strong>
                    </div>
                  ))}
                </div>
                <p style={{ margin: "12px 0 0", color: "var(--muted)", lineHeight: 1.9, fontSize: ".84rem" }}>
                  {market.saleAvgPerM2 != null ? (
                    <>میانگین تقریبی قیمت فروش هر متر: <strong>{market.saleAvgPerM2.toLocaleString("fa-IR")} تومان</strong>. </>
                  ) : null}
                  {market.rentAvg != null ? (
                    <>میانگین اجاره ثبت‌شده: <strong>{market.rentAvg.toLocaleString("fa-IR")} تومان</strong>. </>
                  ) : null}
                  در ۳۰ روز اخیر {market.favorites30d.toLocaleString("fa-IR")} ذخیره، {market.calls30d.toLocaleString("fa-IR")} تماس/واتساپ و {market.viewingRequests30d.toLocaleString("fa-IR")} درخواست بازدید ثبت شده است.
                </p>
              </section>
            ) : null}

            <section style={{ marginTop: 28 }}>
              <h2 style={{ fontSize: "1.15rem", marginBottom: 12 }}>
                فایل‌های فعال در {area.name}
              </h2>
              {properties.length ? (
                <div className="property-grid">
                  {properties.map((property) => (
                    <PropertyCard key={property.id} property={property} />
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--muted)", lineHeight: 1.8 }}>
                  در حال حاضر فایل منتشرشده‌ای برای این محله ثبت نشده است. برای دریافت فایل‌های
                  مناسب {area.name} از فرم درخواست یا تماس با مشاوران استفاده کنید.
                </p>
              )}
            </section>

            {nearby.length ? (
              <section style={{ marginTop: 32 }}>
                <h2 style={{ fontSize: "1.05rem", marginBottom: 12 }}>محله‌های نزدیک در همین منطقه</h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {nearby.map((n) => (
                    <Link
                      key={n.slug}
                      to="/areas/$slug"
                      params={{ slug: n.slug }}
                      className="btn-ghost"
                      style={{ fontSize: "0.85rem", padding: "8px 14px" }}
                    >
                      {n.name}
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="property-detail-side">
            <div className="property-price-box">
              <span>منطقه</span>
              <strong>{area.name}</strong>
            </div>
            <div className="property-contact-box">
              <span className="kicker">مشاوره محلی</span>
              <h2>گروه مشاورین هیرمند</h2>
              <p>برای فایل‌های {area.name} و بازدید هماهنگ کنید.</p>
              <a href={`tel:${SITE.phone.mobile}`} className="btn-gold">
                <Phone size={17} /> تماس با دفتر
              </a>
              <Link to="/" hash="inquiry" className="btn-ghost">
                فرم درخواست فایل
              </Link>
            </div>
          </aside>
        </div>
      </main>
    </SiteChrome>
  );
}
