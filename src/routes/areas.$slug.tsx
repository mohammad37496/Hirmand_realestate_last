import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MapPinned, Phone } from "lucide-react";
import { listPublishedProperties } from "@/lib/properties";
import { getNeighborhoodMarketSnapshot, type NeighborhoodMarketSnapshot } from "@/lib/neighborhood-market";
import { findAreaBySlug, areaHead, areaJsonLd, areaPath, allAreas, type AreaInfo } from "@/lib/areas";
import { listDivarNeighborhoodCatalog } from "@/lib/divar-neighborhoods";
import { normalizeDivarNeighborhoodName } from "@/lib/divar-neighborhood-geometry";
import { breadcrumbJsonLd } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { PropertyCard } from "@/components/hirmand/property-showcase";

export const Route = createFileRoute("/areas/$slug")({
  loader: async ({ params }) => {
    const foundArea = findAreaBySlug(params.slug);
    if (!foundArea) return { area: null, properties: [] as Awaited<ReturnType<typeof listPublishedProperties>>, market: null as NeighborhoodMarketSnapshot | null };

    // Static editorial entries must not leak old/guessed coordinates. Start
    // without geometry and attach a center/bbox only after a unique Divar match.
    let area: AreaInfo = {
      ...foundArea,
      lat: undefined,
      lng: undefined,
      divarDistrictId: undefined,
      divarBbox: undefined,
    };
    try {
      const catalog = await listDivarNeighborhoodCatalog();
      const key = normalizeDivarNeighborhoodName(foundArea.name);
      const matches = catalog.items.filter((item) => normalizeDivarNeighborhoodName(item.name) === key);
      if (matches.length === 1) {
        const source = matches[0];
        area = {
          ...area,
          lat: source.defaultLocation.latitude,
          lng: source.defaultLocation.longitude,
          divarDistrictId: source.id,
          divarBbox: source.bbox,
        };
      } else if (matches.length > 1) {
        console.warn("[area] ambiguous Divar name; withholding coordinates", foundArea.name);
      }
    } catch (error) {
      console.warn("[area] Divar location unavailable; withholding coordinates", error);
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

  const mapsUrl = area.lat != null && area.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${area.lat},${area.lng}`
    : null;
  const divarMapUrl = area.divarBbox && area.lat != null && area.lng != null
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(area.divarBbox.join(","))}&layer=mapnik&marker=${area.lat}%2C${area.lng}`
    : null;

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

        <div className="property-detail-grid">
          <div className="property-detail-main">
            <div className="pcard-meta">
              <span>اصفهان</span>
              <span>{area.groupTitle}</span>
            </div>
            <h1>املاک {area.name}</h1>
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
                  {area.divarDistrictId && area.lat != null && area.lng != null
                    ? `${area.name}، اصفهان — مرکز ثبت‌شده در دیوار: ${area.lat.toFixed(5)}، ${area.lng.toFixed(5)}`
                    : `${area.name}، اصفهان — مرکز معتبر دیوار برای این نام به‌طور یکتا یافت نشد.`}
                </p>
                {divarMapUrl ? (
                  <iframe
                    title={`کادر مکانی برگرفته از دیوار برای ${area.name}`}
                    src={divarMapUrl}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    style={{ display: "block", width: "100%", height: 240, border: 0, borderRadius: 12, marginTop: 10 }}
                  />
                ) : null}
                {mapsUrl ? (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                    باز کردن مرکز دیوار در گوگل‌مپ
                  </a>
                ) : (
                  <small>برای جلوگیری از نمایش نقطه حدسی، لینک مختصات ساخته نشده است.</small>
                )}
                {area.divarBbox ? (
                  <small style={{ display: "block", marginTop: 6 }}>
                    کادر مستطیلی از bbox خود دیوار است؛ دادهٔ چندضلعی مرز در پاسخ دیوار موجود نبود.
                  </small>
                ) : null}
              </div>
            </div>

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
