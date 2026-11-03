import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LocateFixed, MapPin, Navigation, RefreshCcw } from "lucide-react";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { PropertyCard } from "@/components/hirmand/property-showcase";
import { listPublishedPropertyCards } from "@/lib/properties";
import { absoluteUrl, socialMeta } from "@/lib/seo";

export const Route = createFileRoute("/nearby")({
  loader: async () => {
    const properties = await listPublishedPropertyCards({ data: { hasLocationOnly: true, sort: "newest", offset: 0 } });
    return { properties, hasMore: properties.length === 48, nextOffset: properties.length };
  },
  head: () => {
    const title = "فایل‌های نزدیک من | املاک هیرمند";
    const description = "با اجازه موقعیت مکانی، فایل‌های ملکی نزدیک شما را بر اساس فاصله ببینید.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "noindex, follow" },
        ...socialMeta({ title, description, url: absoluteUrl("/nearby") }),
      ],
      links: [{ rel: "canonical", href: absoluteUrl("/nearby") }],
    };
  },
  component: NearbyPage,
});

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earth = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function NearbyPage() {
  const initialData = Route.useLoaderData();
  const [properties, setProperties] = useState(initialData.properties);
  const [nextOffset, setNextOffset] = useState(initialData.nextOffset);
  const [hasMore, setHasMore] = useState(initialData.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [radius, setRadius] = useState(5);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const rows = await listPublishedPropertyCards({
        data: { hasLocationOnly: true, sort: "newest", offset: nextOffset },
      });
      setProperties((current) => {
        const byId = new Map(current.map((property) => [property.id, property]));
        for (const property of rows) byId.set(property.id, property);
        return [...byId.values()];
      });
      setNextOffset((current) => current + 48);
      setHasMore(rows.length === 48);
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setStatus("ready");
      },
      () => setStatus("error"),
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 },
    );
  }

  const nearby = useMemo(() => {
    if (!location) return properties.map((property) => ({ property, distance: null as number | null }));
    return properties
      .map((property) => ({ property, distance: property.latitude != null && property.longitude != null ? distanceKm(location.lat, location.lng, property.latitude, property.longitude) : null }))
      .filter((item) => item.distance != null && item.distance <= radius)
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  }, [location, properties, radius]);

  return (
    <SiteChrome className="property-detail-shell">
      <main className="smart-tool-page">
        <section className="smart-tool-hero nearby-hero">
          <span className="kicker">موقعیت‌محور</span>
          <h1>ملک‌های نزدیک شما</h1>
          <p>اجازه موقعیت مکانی بدهید تا فایل‌های دارای مختصات را بر اساس فاصله مرتب کنیم. موقعیت شما فقط در مرورگر برای محاسبه فاصله استفاده می‌شود.</p>
          <div className="nearby-controls">
            <button type="button" className="btn-gold" onClick={locate} disabled={status === "loading"}>
              <LocateFixed size={17} /> {status === "loading" ? "در حال دریافت موقعیت…" : "پیدا کردن موقعیت من"}
            </button>
            <label className="nearby-radius">
              <span>شعاع جستجو: <strong>{radius.toLocaleString("fa-IR")} کیلومتر</strong></span>
              <input type="range" min="1" max="15" step="1" value={radius} onChange={(event) => setRadius(Number(event.target.value))} />
            </label>
            {status === "ready" ? <span className="nearby-status" role="status" aria-live="polite" aria-atomic="true"><Navigation size={15} /> موقعیت فعال شد</span> : null}
            {status === "error" ? <span className="nearby-status is-error" role="status" aria-live="polite" aria-atomic="true"><RefreshCcw size={15} /> دسترسی موقعیت در دسترس نیست</span> : null}
          </div>
        </section>

        <section className="smart-search-results" aria-live="polite">
          <div className="smart-search-result-head">
            <div>
              <span className="kicker">فایل‌های دارای موقعیت</span>
              <h2>{location ? `${nearby.length.toLocaleString("fa-IR")} فایل در شعاع انتخابی از ${properties.length.toLocaleString("fa-IR")} فایل بارگذاری‌شده` : `${properties.length.toLocaleString("fa-IR")} فایل دارای موقعیت بارگذاری شده`}</h2>
            </div>
          </div>
          {nearby.length ? (
            <div className="property-grid">
              {nearby.map(({ property, distance }) => (
                <div key={property.id} className="nearby-card-wrap">
                  {distance != null ? <div className="nearby-distance"><MapPin size={14} /> {distance < 1 ? Math.round(distance * 1000).toLocaleString("fa-IR") + " متر" : distance.toFixed(1) + " کیلومتر"}</div> : null}
                  <PropertyCard property={property} />
                </div>
              ))}
            </div>
          ) : (
            <section className="property-empty">
              <LocateFixed size={28} />
              <strong>{location ? "در این شعاع فایل دارای موقعیت پیدا نشد." : "فایل دارای مختصات برای نمایش پیدا نشد."}</strong>
              <p>{location ? "شعاع را بیشتر کنید یا موقعیت را دوباره دریافت کنید." : "بعداً دوباره بررسی کنید؛ فایل‌های دارای مختصات اینجا نمایش داده می‌شوند."}</p>
            </section>
          )}
          {hasMore ? (
            <div className="nearby-load-more">
              {loadMoreError ? <p role="alert">بارگذاری فایل‌های بیشتر انجام نشد. دوباره تلاش کنید.</p> : null}
              <button type="button" className="btn-ghost" onClick={() => void loadMore()} disabled={loadingMore} aria-busy={loadingMore}>
                {loadingMore ? "در حال بارگذاری…" : loadMoreError ? "تلاش دوباره برای بارگذاری" : "بارگذاری فایل‌های بیشتر"}
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </SiteChrome>
  );
}
