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
  const bbox = target.divarBbox;
  const encodedBbox = bbox?.map((value) => Number(value.toFixed(7))).join(",");
  const query = encodeURIComponent(target.searchQuery || target.address || `${target.label || "اصفهان"}، اصفهان، ایران`);
  const embedUrl = hasCoordinates && encodedBbox
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${encodedBbox}&layer=mapnik&marker=${target.lat},${target.lng}`
    : hasCoordinates
      ? `https://maps.google.com/maps?q=${target.lat},${target.lng}&z=15&hl=fa&output=embed`
      : `https://maps.google.com/maps?q=${query}&z=13&hl=fa&output=embed`;

  return (
    <div className="map-embed" role="region" aria-label={title}>
      <iframe
        title={title}
        src={embedUrl}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
        style={{ display: "block", width: "100%", height: "340px", border: 0, borderRadius: 16, background: "var(--card)" }}
      />
      <p style={{ margin: "9px 2px 0", fontSize: ".82rem", lineHeight: 1.9, color: "var(--subtle)" }}>
        {hasCoordinates && encodedBbox
          ? "مرکز و گسترهٔ تقریبی از کاتالوگ ذخیره‌شدهٔ محله‌هاست؛ مرز رسمی چندضلعی در دادهٔ منبع موجود نیست."
          : hasCoordinates
            ? "نشانگر بر اساس مختصات ثبت‌شده نمایش داده می‌شود."
            : "برای این محدوده مختصات ثابت تأییدشده‌ای نداریم؛ نقشه با جستجوی نام باز می‌شود."}
      </p>
      <div className="map-local-actions" style={{ marginTop: 10 }}>
        <a href={links.neshan} target="_blank" rel="noopener noreferrer">نشان</a>
        <a href={links.balad} target="_blank" rel="noopener noreferrer">بلد</a>
        <a href={links.google} target="_blank" rel="noopener noreferrer">Google Maps</a>
      </div>
    </div>
  );
}
