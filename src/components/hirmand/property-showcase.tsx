import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  BedDouble,
  Building2,
  CarFront,
  ChevronLeft,
  MapPinned,
  Ruler,
  Search,
} from "lucide-react";
import { NEIGHBORHOOD_NAMES, PROPERTY_TYPES } from "@/lib/site";
import { listNeighborhoodNames } from "@/lib/neighborhoods";
import { mediaSourceCandidates } from "@/lib/media";
import { getPropertyFallbackImage, getPropertyFallbackImageAvif, getPropertyFallbackLegacyImage, isPropertyFallbackImage } from "@/lib/property-fallback-images";
import { formatToman } from "@/lib/money";
import type { Property, PropertyCardData, PropertyType, PropertyTransaction } from "@/lib/properties";
import { isFeaturedActive, listPublishedPropertyCards } from "@/lib/properties";
import { PropertyActions } from "./property-actions";
import { PropertyMediaWatermark } from "@/components/hirmand/property-media-watermark";
import { isPermanentlyWatermarkedMediaUrl } from "@/lib/property-watermark";
import { Reveal } from "./reveal";

const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  apartment: "آپارتمان", villa: "ویلا و باغ", office: "اداری", heritage: "خانه اصیل", land: "زمین", commercial: "تجاری",
};
const TRANSACTION_LABEL: Record<PropertyTransaction, string> = { buy: "خرید", sell: "فروش", rent: "اجاره", mortgage: "رهن" };
function money(value: string | null) { if (!value) return ""; const parsed = Number(value); return Number.isFinite(parsed) ? formatToman(parsed) : value; }
function unitPriceLabel(property: Property | PropertyCardData) {
  if ((property.transactionType !== "buy" && property.transactionType !== "sell") || !property.price || !property.areaM2 || property.areaM2 <= 0) return "";
  const price = Number(property.price);
  if (!Number.isFinite(price) || price <= 0) return "";
  return `هر متر ${formatToman(Math.round(price / property.areaM2))} تومان`;
}
type PriceLine = { label?: string; value: string };
function priceLines(property: Property | PropertyCardData): PriceLine[] {
  const deposit = money(property.deposit);
  const rent = money(property.rent);
  if (property.transactionType === "rent") {
    const lines: PriceLine[] = [];
    if (deposit) lines.push({ label: "رهن", value: `${deposit} تومان` });
    if (rent) lines.push({ label: "اجاره", value: `${rent} تومان` });
    return lines;
  }
  if (property.transactionType === "mortgage") {
    return deposit ? [{ label: "رهن", value: `${deposit} تومان` }] : [];
  }
  const price = money(property.price);
  return price ? [{ value: `${price} تومان` }] : [];
}
function imageFor(property: Property | PropertyCardData) {
  if ("image" in property && property.image && !isPropertyFallbackImage(property.image)) {
    return property.image;
  }
  if ("images" in property) {
    const ownedImage = property.images.find((src) => src && !isPropertyFallbackImage(src));
    if (ownedImage) return ownedImage;
  }
  return getPropertyFallbackImage(property.propertyType, property.id);
}


function PropertyImage({
  src,
  alt,
  fallback,
  fallbackAvif,
  fallbackLegacy,
}: {
  src: string;
  alt: string;
  fallback: string;
  fallbackAvif: string;
  fallbackLegacy: string;
}) {
  const candidates = mediaSourceCandidates(src, fallback);
  const [attempt, setAttempt] = useState(0);
  const [legacyMode, setLegacyMode] = useState(false);
  const current = candidates[Math.min(attempt, candidates.length - 1)] ?? fallback;
  const usingLocalFallback =
    current === fallback && fallback.startsWith("/images/fallback/");
  const usingLocalRasterFallback =
    usingLocalFallback && /\.(avif|webp)$/i.test(fallback);

  return (
    <picture>
      {usingLocalRasterFallback && !legacyMode && fallbackAvif ? (
        <source srcSet={fallbackAvif} type="image/avif" />
      ) : null}
      {usingLocalRasterFallback && !legacyMode ? <source srcSet={fallback} type="image/webp" /> : null}
      <img
        src={legacyMode && usingLocalFallback ? fallbackLegacy : current}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => {
          if (usingLocalFallback && !legacyMode) {
            setLegacyMode(true);
            return;
          }
          setAttempt((value) => Math.min(value + 1, candidates.length - 1));
        }}
      />
    </picture>
  );
}
export function PropertyCard({ property }: { property: Property | PropertyCardData }) {
  const image = imageFor(property);
  const transaction = TRANSACTION_LABEL[property.transactionType];
  const type = PROPERTY_TYPE_LABEL[property.propertyType];
  const code = property.id.slice(-6).toUpperCase();
  const prices = priceLines(property);
  const unitPrice = unitPriceLabel(property);
  const availabilityLabel =
    property.availabilityStatus === "reserved"
      ? "رزرو موقت"
      : property.availabilityStatus === "sold"
        ? "فروخته‌شده"
        : property.availabilityStatus === "rented"
          ? "اجاره‌داده‌شده"
          : property.availabilityStatus === "unavailable"
            ? "فعلاً ناموجود"
            : "موجود";

  return (
    <article className="pcard">
      <Link
        to="/properties/$slug"
        params={{ slug: property.slug.trim() || property.id }}
        className="pcard-link"
        data-property-link="true"
        data-property-id={property.id}
        aria-label={`مشاهده جزئیات کامل فایل ${property.title}`}
      >
        <div className="pcard-media">
          {!isPermanentlyWatermarkedMediaUrl(image) ? (
            <PropertyMediaWatermark subtle={isPropertyFallbackImage(image) || image.startsWith("/images/fallback/")} />
          ) : null}
          <PropertyImage
            src={image}
            alt={property.title}
            fallback={getPropertyFallbackImage(property.propertyType, property.id)}
            fallbackAvif={getPropertyFallbackImageAvif(property.propertyType, property.id)}
            fallbackLegacy={getPropertyFallbackLegacyImage(property.propertyType, property.id)}
          />
          <div className="pcard-badges">
            {isFeaturedActive(property) ? (
              <span className="pcard-badge pcard-badge-featured">ویژه</span>
            ) : null}
            <span className="pcard-badge pcard-badge-transaction">{transaction}</span>
            <span className={
              property.availabilityStatus === "available"
                ? "pcard-badge pcard-badge-availability pcard-badge-availability-ok"
                : "pcard-badge pcard-badge-availability"
            }>
              {availabilityLabel}
            </span>
          </div>
          {property.priceDropPercent && property.priceDropPercent > 0 ? (
            <span className="pcard-badge pcard-badge-discount">
              ٪{property.priceDropPercent.toLocaleString("fa-IR")} کاهش
            </span>
          ) : null}
          <span className="pcard-arrow" aria-hidden="true">
            <ChevronLeft size={16} />
          </span>
        </div>

        <div className="pcard-body">
          <div className="pcard-topline">
            <div className="pcard-meta">
              <span>{transaction}</span>
              <span>{type}</span>
            </div>
            <span className="pcard-code">کد {code}</span>
          </div>

          <h3 className="pcard-title">{property.title}</h3>

          <div className="pcard-price-row">
            {prices.length ? (
              prices.map((price) =>
                price.label ? (
                  <p key={`${price.label}-${price.value}`} className="pcard-price-line">
                    <span className="pcard-price-label">{price.label}</span>
                    <span className="pcard-price-value">{price.value}</span>
                  </p>
                ) : (
                  <p key={price.value} className="pcard-price">
                    {price.value}
                  </p>
                ),
              )
            ) : (
              <p className="pcard-price pcard-price-pending">تماس برای قیمت</p>
            )}
            {unitPrice ? <span className="pcard-unit-price">{unitPrice}</span> : null}
          </div>

          <div
            className="pcard-specs"
            aria-label="مشخصات خلاصه"
          >
            {property.areaM2 ? (
              <span className="pcard-spec">
                <Ruler size={14} aria-hidden="true" /> {property.areaM2.toLocaleString("fa-IR")} متر
              </span>
            ) : null}
            {property.bedrooms ? (
              <span className="pcard-spec">
                <BedDouble size={14} aria-hidden="true" /> {property.bedrooms.toLocaleString("fa-IR")} خواب
              </span>
            ) : null}
            {property.parking ? (
              <span className="pcard-spec">
                <CarFront size={14} aria-hidden="true" /> پارکینگ
              </span>
            ) : null}
            {property.elevator ? (
              <span className="pcard-spec">
                <Building2 size={14} aria-hidden="true" /> آسانسور
              </span>
            ) : null}
          </div>

          <div className="pcard-footer">
            <span className="pcard-location">
              <MapPinned size={14} /> {property.neighborhood}
            </span>
            <span className="pcard-details-link">
              مشاهده جزئیات <ChevronLeft size={14} />
            </span>
          </div>
        </div>
      </Link>

      <div className="pcard-actions" aria-label="عملیات فایل">
        <PropertyActions property={property} compact />
      </div>
    </article>
  );
}

export function PropertyShowcase({ initialProperties = [] }: { initialProperties?: PropertyCardData[] }) {
  const [properties, setProperties] = useState(initialProperties);
  const [transactionType, setTransactionType] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [loading, setLoading] = useState(false);
  const [neighborhoods, setNeighborhoods] = useState<string[]>(NEIGHBORHOOD_NAMES);

  useEffect(() => {
    let cancelled = false;
    void listNeighborhoodNames()
      .then((names) => {
        if (!cancelled && names.length) setNeighborhoods(names);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listPublishedPropertyCards({ data: {} })
      .then((next) => {
        if (!cancelled) setProperties(next);
      })
      .catch(() => {
        // The public marketing page must remain usable without a database.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function applyFilters() {
    setLoading(true);
    try {
      const next = await listPublishedPropertyCards({
        data: {
          transactionType: (transactionType || undefined) as PropertyTransaction | undefined,
          propertyType: (propertyType || undefined) as PropertyType | undefined,
          neighborhood: neighborhood || undefined,
        },
      });
      setProperties(next);
    } catch {
      toast.error("جستجوی فایل‌ها انجام نشد. لطفاً دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  }
  return <Reveal as="section" className="section property-showcase" id="listings"><SectionHead kicker="فایل‌های فعال" title="ملک‌های موجود هیرمند" text="فایل‌های منتشرشده را ببینید، جزئیات را باز کنید و برای هر ملک مستقیم با مشاور تماس بگیرید." />
    <div className="property-showcase-cta">
      <Link to="/properties" className="text-link">مشاهده همه فایل‌ها</Link>
      <Link to="/budget-match" className="text-link">جستجوی هوشمند بودجه</Link>
    </div>
    <div className="property-toolbar"><div className="property-toolbar-title"><span className="icon-box sm"><Search size={16} /></span><div><strong>جستجوی فایل</strong><small>{loading ? "در حال جستجو…" : `${properties.length.toLocaleString("fa-IR")} فایل نمایش داده می‌شود`}</small></div></div>
      <div className="property-filters"><label><span className="sr-only">نوع معامله</span><select value={transactionType} onChange={(event) => setTransactionType(event.target.value)}><option value="">همه معاملات</option><option value="buy">خرید</option><option value="sell">فروش</option><option value="rent">اجاره</option><option value="mortgage">رهن</option></select></label>
        <label><span className="sr-only">نوع ملک</span><select value={propertyType} onChange={(event) => setPropertyType(event.target.value)}><option value="">همه انواع ملک</option>{PROPERTY_TYPES.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label><span className="sr-only">محله</span><select value={neighborhood} onChange={(event) => setNeighborhood(event.target.value)}><option value="">همه محله‌ها</option>{neighborhoods.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <button type="button" className="btn-gold property-filter-button" onClick={applyFilters} disabled={loading}>{loading ? "در حال جستجو..." : "جستجو"}</button>
      </div></div>
    {properties.length ? <div className="property-grid">{properties.map((property) => <PropertyCard key={property.id} property={property} />)}</div> : <div className="property-empty"><MapPinned size={24} /><strong>فعلاً فایل منتشرشده‌ای با این فیلتر پیدا نشد.</strong><p>فیلترها را تغییر دهید یا درخواست ملک ثبت کنید تا مشاور فایل مناسب را برایتان پیدا کند.</p><div className="properties-empty-actions"><Link to="/" hash="inquiry" className="btn-gold">ثبت درخواست ملک</Link><Link to="/budget-match" className="btn-ghost">جستجوی بودجه</Link></div></div>}
  </Reveal>;
}
function SectionHead({ kicker, title, text }: { kicker: string; title: string; text?: string }) { return <div className="section-head"><span className="kicker">{kicker}</span><h2>{title}</h2>{text ? <p>{text}</p> : null}</div>; }
