import { MapPinned, Navigation } from "lucide-react";
import { mapLinks, type MapTarget } from "@/lib/site";

export function MapAppButtons({
  target,
  googleHref,
  googleOnly = false,
}: {
  target: MapTarget;
  googleHref?: string;
  googleOnly?: boolean;
}) {
  const links = mapLinks(target);
  const google = googleHref ?? links.google;
  const apps = googleOnly
    ? [{ href: google, title: "گوگل مپ", text: "جستجوی دقیق محله" }]
    : [
        { href: google, title: "Google Maps", text: "بررسی تکمیلی مقصد" },
        { href: links.balad, title: "بلد", text: "اپلیکیشن بلد" },
        { href: links.neshan, title: "نشان", text: "اپلیکیشن نشان" },
      ];

  return (
    <div className="map-app-row">
      {apps.map((app) => (
        <a
          key={app.title}
          className="map-app-btn"
          href={app.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="icon-box sm">
            {app.title === "Google Maps" ? (
              <MapPinned size={15} strokeWidth={1.8} />
            ) : (
              <Navigation size={15} strokeWidth={1.8} />
            )}
          </span>
          <span>
            <strong>{app.title}</strong>
            <small>{app.text}</small>
          </span>
        </a>
      ))}
    </div>
  );
}

export function MapEmbed({ target, title }: { target: MapTarget; title: string }) {
  const links = mapLinks(target);
  const hasCoordinates = target.lat != null && target.lng != null;

  return (
    <div className="map-embed" role="region" aria-label={title}>
      <div className="map-local-preview">
        <div className="map-grid" aria-hidden="true" />
        <div className="map-route map-route-a" aria-hidden="true" />
        <div className="map-route map-route-b" aria-hidden="true" />
        <div className="map-route map-route-c" aria-hidden="true" />
        <div className="map-pin" aria-hidden="true">
          <MapPinned size={22} strokeWidth={1.9} />
        </div>
        <div className="map-local-card">
          <strong>{target.label}</strong>
          <span>اصفهان</span>
          {hasCoordinates ? (
            <small>{target.lat!.toFixed(6)}، {target.lng!.toFixed(6)}</small>
          ) : (
            <small className="map-accuracy-note">مختصات ثابت ذخیره نشده؛ موقعیت از جستجوی مستقیم نقشه انتخاب می‌شود.</small>
          )}
          <div className="map-local-actions">
            <a href={links.neshan} target="_blank" rel="noopener noreferrer">
              <Navigation size={14} />
              نشان
            </a>
            <a href={links.balad} target="_blank" rel="noopener noreferrer">
              <Navigation size={14} />
              بلد
            </a>
            <a href={links.google} target="_blank" rel="noopener noreferrer">
              <MapPinned size={14} />
              Google Maps
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
