import { Camera, ExternalLink, Maximize2 } from "lucide-react";
import type { Property } from "@/lib/properties";
import "@/property-virtual-tour.css";

function safeUrl(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function canEmbed(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "my.matterport.com" ||
    host.endsWith(".matterport.com") ||
    host === "kuula.co" ||
    host.endsWith(".kuula.co") ||
    host === "cloudpano.com" ||
    host.endsWith(".cloudpano.com")
  );
}

export function PropertyVirtualTour({ property }: { property: Property }) {
  const url = safeUrl(property.virtualTourUrl);
  if (!url) return null;

  const embeddable = canEmbed(url.hostname);
  const title = "تور مجازی " + property.title;

  return (
    <section className="property-virtual-tour" aria-labelledby="property-virtual-tour-title">
      <header className="property-virtual-tour-head">
        <div>
          <span className="kicker"><Camera size={14} /> بازدید مجازی</span>
          <h2 id="property-virtual-tour-title">تور مجازی این فایل</h2>
          <p>فضای ملک را از راه دور بررسی کنید؛ برای مشاهده کامل می‌توانید تور را در صفحه جداگانه هم باز کنید.</p>
        </div>
        <a href={url.toString()} target="_blank" rel="noopener noreferrer" className="btn-ghost">
          <ExternalLink size={15} /> باز کردن تور
        </a>
      </header>

      {embeddable ? (
        <div className="property-virtual-tour-frame">
          <iframe
            src={url.toString()}
            title={title}
            loading="lazy"
            allow="fullscreen; autoplay; xr-spatial-tracking"
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <a
            className="property-virtual-tour-fullscreen"
            href={url.toString()}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Maximize2 size={14} /> تمام‌صفحه
          </a>
        </div>
      ) : (
        <div className="property-virtual-tour-external">
          <Camera size={26} />
          <div>
            <strong>تور مجازی آماده مشاهده است.</strong>
            <span>برای این سرویس، نمایش داخلی فعال نیست و تور در صفحه امن سرویس‌دهنده باز می‌شود.</span>
          </div>
          <a href={url.toString()} target="_blank" rel="noopener noreferrer" className="btn-gold">
            مشاهده تور <ExternalLink size={15} />
          </a>
        </div>
      )}
    </section>
  );
}
