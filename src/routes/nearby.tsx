import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LocateFixed, MapPin, Navigation, RefreshCcw } from "lucide-react";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { PropertyCard } from "@/components/hirmand/property-showcase";
import { listPublishedPropertyCards, type PropertyCardData } from "@/lib/properties";
import { absoluteUrl, socialMeta } from "@/lib/seo";

export const Route = createFileRoute("/nearby")({
  loader: async () => {
    const batches = await Promise.all(
      [0, 48, 96, 144].map((offset) => listPublishedPropertyCards({ data: { hasLocationOnly: true, sort: "newest", offset } })),
    );
    const byId = new Map<string, PropertyCardData>();
    for (const batch of batches) for (const property of batch) byId.set(property.id, property);
    return { properties: [...byId.values()] };
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
  const { properties } = Route.useLoaderData();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [radius, setRadius] = useState(5);

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
            {status === "ready" ? <span className="nearby-status"><Navigation size={15} /> موقعیت فعال شد</span> : null}
            {status === "error" ? <span className="nearby-status is-error"><RefreshCcw size={15} /> دسترسی موقعیت در دسترس نیست</span> : null}
          </div>
        </section>

        <section className="smart-search-results" aria-live="polite">
          <div className="smart-search-result-head">
            <div>
              <span className="kicker">فایل‌های دارای موقعیت</span>
              <h2>{location ? nearby.length.toLocaleString("fa-IR") + " فایل در شعاع انتخابی" : nearby.length.toLocaleString("fa-IR") + " فایل آماده بررسی"}</h2>
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
            <section className="property-empty"><LocateFixed size={28} /><strong>در این شعاع فایل دارای موقعیت پیدا نشد.</strong><p>شعاع را بیشتر کنید یا موقعیت را دوباره دریافت کنید.</p></section>
          )}
        </section>
      </main>
    </SiteChrome>
  );
}
