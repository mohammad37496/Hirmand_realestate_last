import { Briefcase, Building2, ExternalLink, Home, MapPinned, Navigation, ShieldCheck, Trees } from "lucide-react";
import type { Property } from "@/lib/properties";

const CATEGORIES = [
  { id: "school", label: "مدرسه و مهدکودک", query: "مدرسه مهدکودک", icon: Building2 },
  { id: "medical", label: "درمانگاه و بیمارستان", query: "درمانگاه بیمارستان", icon: ShieldCheck },
  { id: "shopping", label: "فروشگاه و سوپرمارکت", query: "سوپرمارکت فروشگاه", icon: Home },
  { id: "transit", label: "مترو و ایستگاه اتوبوس", query: "مترو ایستگاه اتوبوس", icon: Navigation },
  { id: "parks", label: "پارک و فضای سبز", query: "پارک فضای سبز", icon: Trees },
  { id: "bank", label: "بانک و خودپرداز", query: "بانک خودپرداز", icon: Briefcase },
] as const;

function mapsSearchUrl(property: Pick<Property, "latitude" | "longitude" | "neighborhood">, query: string) {
  const location =
    property.latitude != null && property.longitude != null
      ? property.latitude + "," + property.longitude
      : "اصفهان " + property.neighborhood;
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query + " نزدیک " + location);
}

function mapsAreaUrl(property: Pick<Property, "latitude" | "longitude" | "neighborhood">) {
  const location =
    property.latitude != null && property.longitude != null
      ? property.latitude + "," + property.longitude
      : "اصفهان " + property.neighborhood;
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("خدمات و اماکن نزدیک " + location);
}

export function PropertyNearbyServices({
  property,
}: {
  property: Pick<Property, "latitude" | "longitude" | "neighborhood">;
}) {
  return (
    <section id="property-nearby-services" className="property-new-feature property-nearby-services" aria-labelledby="property-nearby-services-title">
      <header className="property-new-feature-head">
        <div>
          <span className="kicker"><MapPinned size={14} /> اطراف ملک</span>
          <h2 id="property-nearby-services-title">خدمات مهم نزدیک این ملک</h2>
          <p>برای بررسی سریع محیط اطراف، دسته‌بندی موردنظر را باز کنید؛ جستجو روی نقشه با مرکزیت محدوده تقریبی فایل انجام می‌شود.</p>
        </div>
        <a className="property-new-feature-badge property-new-feature-link-badge" href={mapsAreaUrl(property)} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={13} /> مشاهده اطراف روی نقشه
        </a>
      </header>

      <div className="property-nearby-grid">
        {CATEGORIES.map((category) => {
          const Icon = category.icon;
          return (
            <a
              key={category.id}
              className="property-nearby-card"
              href={mapsSearchUrl(property, category.query)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="property-nearby-card-icon"><Icon size={19} /></span>
              <span>
                <strong>{category.label}</strong>
                <small>جستجوی نزدیک‌ترین گزینه‌ها روی نقشه</small>
              </span>
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          );
        })}
      </div>

      <div className="property-nearby-note">
        <MapPinned size={15} />
        <span>فاصله و نتیجه نهایی به داده زنده نقشه وابسته است؛ این بخش عمداً فاصله عددی ساختگی نمایش نمی‌دهد.</span>
      </div>
    </section>
  );
}
