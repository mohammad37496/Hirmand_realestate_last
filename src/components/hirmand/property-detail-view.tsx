import { Link } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bath,
  BedDouble,
  Building2,
  CalendarDays,
  CarFront,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Compass,
  DoorOpen,
  ExternalLink,
  ImageOff,
  Info,
  Layers3,
  MapPin,
  MapPinned,
  MessageCircle,
  Phone,
  Ruler,
  ShieldCheck,
  Warehouse,
  X,
} from "lucide-react";
import { PropertyActions } from "@/components/hirmand/property-actions";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import type { Property } from "@/lib/properties";
import { isFeaturedActive } from "@/lib/properties";
import { isPropertyFallbackImage } from "@/lib/property-fallback-images";
import { isVideoUrl, mediaSourceCandidates } from "@/lib/media";
import { formatToman, parseAmount } from "@/lib/money";
import { formatPersianDate } from "@/lib/persian-date";
import { SITE } from "@/lib/site";
import { breadcrumbJsonLd, propertyJsonLd } from "@/lib/seo";
import { trackAnalyticsEvent } from "@/lib/analytics";
import {
  PROPERTY_CABINET_OPTIONS,
  PROPERTY_COOLING_OPTIONS,
  PROPERTY_FLOORING_OPTIONS,
  PROPERTY_HEATING_OPTIONS,
  PROPERTY_OTHER_AMENITY_OPTIONS,
  PROPERTY_WALL_CLOSET_OPTIONS,
  labelForOption,
} from "@/lib/property-options";

const TRANSACTION_LABEL: Record<Property["transactionType"], string> = {
  buy: "خرید",
  sell: "فروش",
  rent: "اجاره",
  mortgage: "رهن",
};

const PROPERTY_TYPE_LABEL: Record<Property["propertyType"], string> = {
  apartment: "آپارتمان",
  villa: "ویلا و باغ",
  office: "ملک اداری",
  heritage: "خانه اصیل",
  land: "زمین",
  commercial: "ملک تجاری",
};

const AVAILABILITY_LABEL: Record<Property["availabilityStatus"], string> = {
  available: "موجود",
  reserved: "رزرو موقت",
  sold: "فروخته‌شده",
  rented: "اجاره‌داده‌شده",
  unavailable: "فعلاً ناموجود",
};

const ORIENTATION_LABEL: Record<NonNullable<Property["orientation"]>, string> = {
  north: "شمالی",
  south: "جنوبی",
  east: "شرقی",
  west: "غربی",
  northeast: "شمال‌شرقی",
  northwest: "شمال‌غربی",
  southeast: "جنوب‌شرقی",
  southwest: "جنوب‌غربی",
  two_fronts: "دو نبش",
  three_fronts: "سه نبش",
  four_fronts: "چهار نبش",
  other: "سایر",
};

type SpecItem = {
  label: string;
  value: string;
  icon: typeof Ruler;
};

type PriceLine = {
  label: string;
  value: string;
};

function cleanText(value: string | null | undefined): string {
  const text = value?.trim() ?? "";
  return text && !/^(null|undefined)$/i.test(text) ? text : "";
}

function moneyLabel(value: string | null | undefined): string {
  const raw = cleanText(value);
  if (!raw) return "";
  const amount = parseAmount(raw);
  return formatToman(amount);
}

function priceLines(property: Property): PriceLine[] {
  const deposit = moneyLabel(property.deposit);
  const rent = moneyLabel(property.rent);
  const price = moneyLabel(property.price);
  const rows: PriceLine[] = [];

  if (property.transactionType === "rent") {
    if (cleanText(property.deposit)) rows.push({ label: "مبلغ رهن", value: deposit + " تومان" });
    if (cleanText(property.rent)) rows.push({ label: "اجارهٔ ماهانه", value: rent + " تومان" });
  } else if (property.transactionType === "mortgage") {
    if (cleanText(property.deposit)) rows.push({ label: "مبلغ رهن", value: deposit + " تومان" });
  } else if (cleanText(property.price)) {
    rows.push({
      label: property.transactionType === "sell" ? "قیمت فروش" : "قیمت خرید",
      value: price + " تومان",
    });
  }

  return rows;
}

function pricePerMeter(property: Property): string {
  if (property.transactionType !== "buy" && property.transactionType !== "sell") return "";
  if (property.areaM2 == null || property.areaM2 <= 0 || !cleanText(property.price)) return "";
  const amount = parseAmount(property.price);
  if (amount <= 0) return "";
  return formatToman(Math.round(amount / property.areaM2)) + " تومان به‌ازای هر متر";
}

function formatDate(value: string | null | undefined): string {
  const raw = cleanText(value);
  if (!raw) return "";
  try {
    return formatPersianDate(raw.slice(0, 10));
  } catch {
    return "";
  }
}

function normalizePhone(value: string | null | undefined): string {
  return cleanText(value)
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\D/g, "");
}

function whatsappPhone(value: string): string {
  if (/^09\d{9}$/.test(value)) return "98" + value.slice(1);
  if (/^989\d{9}$/.test(value)) return value;
  return "";
}

function hasValidCoordinates(latitude: number | null, longitude: number | null): boolean {
  return latitude != null &&
    longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;
}

function osmEmbedUrl(latitude: number, longitude: number): string {
  const delta = 0.008;
  const bounds = [
    longitude - delta,
    latitude - delta,
    longitude + delta,
    latitude + delta,
  ].join(",");
  return "https://www.openstreetmap.org/export/embed.html?bbox=" +
    encodeURIComponent(bounds) +
    "&layer=mapnik&marker=" +
    encodeURIComponent(latitude + "," + longitude);
}

function mapOpenUrl(property: Property, exactCoordinates: boolean): string {
  const query = exactCoordinates
    ? property.latitude + "," + property.longitude
    : [property.address, property.neighborhood, property.city].map(cleanText).filter(Boolean).join("، ");
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
}

function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function optionLabel(
  value: string | null | undefined,
  options: readonly { value: string; label: string }[],
): string {
  return value ? labelForOption(options, value) : "";
}

function amenityLabel(value: string): string {
  if (value.startsWith("cooling:")) {
    return optionLabel(value.slice("cooling:".length), PROPERTY_COOLING_OPTIONS);
  }
  if (value.startsWith("heating:")) {
    return optionLabel(value.slice("heating:".length), PROPERTY_HEATING_OPTIONS);
  }
  return optionLabel(value, PROPERTY_OTHER_AMENITY_OPTIONS) || value.replace(/[_:]+/g, " ").trim();
}

function buildSpecs(property: Property): SpecItem[] {
  const items: SpecItem[] = [];
  const residential = ["apartment", "villa", "heritage"].includes(property.propertyType);
  const constructed = property.propertyType !== "land";

  if (property.areaM2 != null) {
    items.push({ label: "متراژ", value: property.areaM2.toLocaleString("fa-IR") + " متر مربع", icon: Ruler });
  }
  if (residential && property.bedrooms != null) {
    items.push({ label: "تعداد خواب", value: property.bedrooms.toLocaleString("fa-IR"), icon: BedDouble });
  }
  if (residential && property.bathrooms != null) {
    items.push({ label: "سرویس و حمام", value: property.bathrooms.toLocaleString("fa-IR"), icon: Bath });
  }
  if (constructed && property.builtYear != null) {
    items.push({
      label: "سال ساخت",
      value: property.builtYear.toLocaleString("fa-IR", { useGrouping: false }),
      icon: CalendarDays,
    });
  }
  if (constructed && property.floorLabel === "suite") {
    items.push({ label: "طبقه", value: "سوئیت", icon: Layers3 });
  } else if (constructed && property.floor != null) {
    items.push({ label: "طبقه", value: property.floor.toLocaleString("fa-IR"), icon: Layers3 });
  }
  if (constructed && property.totalFloors != null) {
    items.push({ label: "تعداد طبقات ساختمان", value: property.totalFloors.toLocaleString("fa-IR"), icon: Building2 });
  }
  if (property.orientation) {
    items.push({ label: "جهت ملک", value: ORIENTATION_LABEL[property.orientation], icon: Compass });
  }
  if (constructed) {
    items.push({ label: "پارکینگ", value: property.parking ? "دارد" : "ندارد", icon: CarFront });
    items.push({ label: "آسانسور", value: property.elevator ? "دارد" : "ندارد", icon: Building2 });
    items.push({ label: "انباری", value: property.storage ? "دارد" : "ندارد", icon: Warehouse });
  }
  const cabinet = optionLabel(property.cabinetType, PROPERTY_CABINET_OPTIONS);
  const flooring = optionLabel(property.flooringType, PROPERTY_FLOORING_OPTIONS);
  const closet = optionLabel(property.wallClosetType, PROPERTY_WALL_CLOSET_OPTIONS);
  if (cabinet) items.push({ label: "نوع کابینت", value: cabinet, icon: DoorOpen });
  if (flooring) items.push({ label: "کف‌پوش", value: flooring, icon: Layers3 });
  if (closet) items.push({ label: "کمد دیواری", value: closet, icon: Warehouse });
  if (property.painted) items.push({ label: "وضعیت رنگ", value: "رنگ‌شده", icon: Check });
  if (property.wallpaper) items.push({ label: "کاغذ دیواری", value: "دارد", icon: Check });

  return items;
}

function PropertyImage({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const candidates = useMemo(() => mediaSourceCandidates(src), [src]);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setAttempt(0);
    setFailed(false);
  }, [src]);

  if (failed || candidates.length === 0) {
    return (
      <span className={"hd-image-missing " + (className || "")} role="img" aria-label={alt}>
        <ImageOff size={24} aria-hidden="true" />
        <span>تصویر در دسترس نیست</span>
      </span>
    );
  }

  return (
    <img
      className={className}
      src={candidates[Math.min(attempt, candidates.length - 1)]}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (attempt < candidates.length - 1) setAttempt((value) => value + 1);
        else setFailed(true);
      }}
    />
  );
}

function Gallery({ property }: { property: Property }) {
  const images = useMemo(
    () => [...new Set((property.images ?? []).map(cleanText).filter((src) => src && !isPropertyFallbackImage(src)))],
    [property.images],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const activeIndexSafe = images.length ? Math.min(activeIndex, images.length - 1) : 0;
  const current = images[activeIndexSafe] || "";
  const currentIsVideo = current ? isVideoUrl(current) : false;

  useEffect(() => {
    setActiveIndex(0);
    setLightboxOpen(false);
  }, [property.id]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowRight" && images.length > 1) {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % images.length);
      }
      if (event.key === "ArrowLeft" && images.length > 1) {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + images.length) % images.length);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [lightboxOpen, images.length]);

  const move = (step: number) => {
    if (images.length) setActiveIndex((index) => (index + step + images.length) % images.length);
  };

  const renderMedia = (src: string, alt: string, priority = false) => {
    if (isVideoUrl(src)) {
      const candidates = mediaSourceCandidates(src);
      return (
        <video
          className="hd-gallery-video"
          src={candidates[0] || src}
          controls
          playsInline
          preload={priority ? "metadata" : "none"}
          aria-label={"ویدئوی فایل " + alt}
        />
      );
    }
    return <PropertyImage src={src} alt={alt} className="hd-gallery-image" priority={priority} />;
  };

  return (
    <section className="hd-gallery-section" aria-label="گالری تصاویر ملک">
      <div className="property-gallery-wrap hd-gallery-wrap" role="region" aria-label={"گالری تصاویر " + property.title}>
        <div className="property-gallery hd-gallery">
          <div className="property-gallery-main hd-gallery-main">
            {current ? (
              <>
                <div className="hd-gallery-stage">
                  {renderMedia(current, property.title, true)}
                  {!currentIsVideo ? (
                    <button type="button" className="hd-gallery-expand" onClick={() => setLightboxOpen(true)} aria-label="نمایش تصویر در اندازهٔ بزرگ">
                      بزرگ‌نمایی تصویر
                    </button>
                  ) : null}
                </div>
                <div className="hd-gallery-controls">
                  <button type="button" onClick={() => move(-1)} aria-label="تصویر قبلی" disabled={images.length < 2}>
                    <ChevronRight size={18} />
                  </button>
                  <span className="property-gallery-counter">
                    تصویر {(activeIndexSafe + 1).toLocaleString("fa-IR")} از {images.length.toLocaleString("fa-IR")}
                  </span>
                  <button type="button" onClick={() => move(1)} aria-label="تصویر بعدی" disabled={images.length < 2}>
                    <ChevronLeft size={18} />
                  </button>
                </div>
              </>
            ) : (
              <div className="hd-gallery-empty" role="img" aria-label="تصویر واقعی برای این فایل ثبت نشده است">
                <ImageOff size={42} strokeWidth={1.5} aria-hidden="true" />
                <strong>تصویری برای این فایل ثبت نشده است</strong>
                <span>برای مشاهدهٔ جزئیات، مشخصات و راه‌های تماس از بخش‌های پایین استفاده کنید.</span>
              </div>
            )}
          </div>

          {images.length ? (
            <div className="property-gallery-thumbs hd-gallery-thumbs" aria-label="انتخاب تصویر">
              {images.map((src, index) => (
                <button
                  className={"property-gallery-thumb hd-gallery-thumb" + (index === activeIndexSafe ? " is-active" : "")}
                  key={src}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-label={"نمایش تصویر " + (index + 1).toLocaleString("fa-IR")}
                  aria-pressed={index === activeIndexSafe}
                >
                  {isVideoUrl(src) ? <span className="hd-video-thumb">ویدئو</span> : <PropertyImage src={src} alt="" />}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {lightboxOpen && current && !currentIsVideo && typeof document !== "undefined"
        ? createPortal(
            <div className="hd-lightbox" role="dialog" aria-modal="true" aria-labelledby="hd-lightbox-title" onMouseDown={(event) => {
              if (event.target === event.currentTarget) setLightboxOpen(false);
            }}>
              <h2 id="hd-lightbox-title" className="hd-visually-hidden">نمایش تصویر ملک</h2>
              <button ref={closeButtonRef} className="hd-lightbox-close" type="button" onClick={() => setLightboxOpen(false)} aria-label="بستن نمایش بزرگ">
                <X size={24} />
              </button>
              {images.length > 1 ? (
                <>
                  <button className="hd-lightbox-next" type="button" onClick={() => move(1)} aria-label="تصویر بعدی"><ChevronLeft size={30} /></button>
                  <button className="hd-lightbox-prev" type="button" onClick={() => move(-1)} aria-label="تصویر قبلی"><ChevronRight size={30} /></button>
                </>
              ) : null}
              <div className="hd-lightbox-media"><PropertyImage src={current} alt={property.title} priority /></div>
              <div className="hd-lightbox-count">تصویر {(activeIndexSafe + 1).toLocaleString("fa-IR")} از {images.length.toLocaleString("fa-IR")}</div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function RelatedPropertyCard({ property }: { property: Property }) {
  const image = (property.images ?? []).find((src) => cleanText(src) && !isPropertyFallbackImage(src) && !isVideoUrl(src));
  const prices = priceLines(property);
  const specs = [
    property.areaM2 != null ? property.areaM2.toLocaleString("fa-IR") + " متر" : "",
    property.bedrooms != null && ["apartment", "villa", "heritage"].includes(property.propertyType)
      ? property.bedrooms.toLocaleString("fa-IR") + " خواب"
      : "",
  ].filter(Boolean);

  return (
    <article className="hd-related-card">
      <Link
        to="/properties/$slug"
        params={{ slug: cleanText(property.slug) || property.id }}
        className="hd-related-link"
        data-property-link="true"
        data-property-id={property.id}
        aria-label={"مشاهدهٔ جزئیات " + property.title}
      >
        <div className="hd-related-media">
          {image ? <PropertyImage src={image} alt={property.title} /> : (
            <span className="hd-related-no-image"><ImageOff size={24} aria-hidden="true" /><span>تصویر ثبت نشده</span></span>
          )}
          <span className="hd-related-transaction">{TRANSACTION_LABEL[property.transactionType]}</span>
        </div>
        <div className="hd-related-content">
          <span className="hd-related-type">{PROPERTY_TYPE_LABEL[property.propertyType]} · {cleanText(property.neighborhood) || "اصفهان"}</span>
          <h3>{property.title}</h3>
          {specs.length ? <p className="hd-related-specs">{specs.join(" · ")}</p> : null}
          <div className="hd-related-price">
            {prices.length ? prices.map((row) => (
              <p key={row.label}><span>{row.label}</span><strong>{row.value}</strong></p>
            )) : <strong>برای اطلاع از قیمت تماس بگیرید</strong>}
          </div>
          <span className="hd-related-more">مشاهدهٔ فایل <ArrowLeft size={16} aria-hidden="true" /></span>
        </div>
      </Link>
    </article>
  );
}

export function PropertyDetailView({
  property,
  related = [],
}: {
  property: Property | null;
  related?: Property[];
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!property) return;
    try {
      const key = "hirmand-viewed:" + property.slug;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      trackAnalyticsEvent("property_view", property.slug);
    } catch {
      // Storage can be disabled in private mode; tracking must not break the page.
    }
  }, [property]);

  const copyPageUrl = async () => {
    const url = window.location.href;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("پیوند فایل را کپی کنید:", url);
    }
  };

  if (!property) {
    return (
      <SiteChrome>
        <main className="property-detail-page hd-property-detail-v2" id="top" dir="rtl">
          <section className="hd-section hd-not-found">
            <div className="hd-section-icon"><ImageOff size={26} aria-hidden="true" /></div>
            <h1>فایل موردنظر پیدا نشد</h1>
            <p>این فایل در دسترس نیست یا دیگر منتشر نشده است.</p>
            <Link to="/properties" className="hd-button hd-button-primary">بازگشت به فهرست فایل‌ها</Link>
          </section>
        </main>
      </SiteChrome>
    );
  }

  const title = cleanText(property.title) || "جزئیات فایل ملک";
  const typeLabel = PROPERTY_TYPE_LABEL[property.propertyType];
  const transactionLabel = TRANSACTION_LABEL[property.transactionType];
  const locationParts = [cleanText(property.neighborhood), cleanText(property.city)].filter(Boolean);
  const locationLabel = locationParts.join("، ");
  const locationDescription = [cleanText(property.address), ...locationParts].filter(Boolean).join("، ");
  const exactCoordinates = hasValidCoordinates(property.latitude, property.longitude);
  const publishedDate = formatDate(property.publishedAt);
  const updatedDate = formatDate(property.updatedAt);
  const code = cleanText(property.id).slice(-8).toUpperCase();
  const prices = priceLines(property);
  const perMeter = pricePerMeter(property);
  const specs = buildSpecs(property);
  const features = [...new Set([
    ...(property.features ?? []).map(cleanText).filter(Boolean),
    ...(property.otherAmenities ?? []).map(amenityLabel).map(cleanText).filter(Boolean),
    optionLabel(property.coolingSystem, PROPERTY_COOLING_OPTIONS),
    optionLabel(property.heatingSystem, PROPERTY_HEATING_OPTIONS),
  ].filter(Boolean))];
  const phone = normalizePhone(property.contactPhone) || SITE.phone.mobile;
  const telHref = "tel:" + phone;
  const waPhone = whatsappPhone(phone);
  const waHref = waPhone
    ? "https://wa.me/" + waPhone + "?text=" + encodeURIComponent(
      "سلام، دربارهٔ فایل «" + title + "» با کد " + code + " در سایت املاک هیرمند سؤال دارم.",
    )
    : "";
  const contactName = cleanText(property.contactName) || SITE.nameFa;
  const status = AVAILABILITY_LABEL[property.availabilityStatus];
  const relatedItems = (related ?? []).filter((item) => item.id !== property.id).slice(0, 6);

  return (
    <SiteChrome>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(propertyJsonLd(property)) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(breadcrumbJsonLd([
            { name: "خانه", path: "/" },
            { name: "فایل‌های ملکی", path: "/properties" },
            ...(locationLabel ? [{ name: locationLabel, path: "/properties" }] : []),
            { name: title, path: "/properties/" + encodeURIComponent(property.slug) },
          ])),
        }}
      />

      <main className="property-detail-page hd-property-detail-v2" id="top" dir="rtl">
        <nav className="hd-breadcrumb" aria-label="مسیر صفحه">
          <Link to="/">خانه</Link>
          <ChevronLeft size={15} aria-hidden="true" />
          <Link to="/properties">فایل‌های ملکی</Link>
          <ChevronLeft size={15} aria-hidden="true" />
          <span aria-current="page">{title}</span>
        </nav>

        <section className="property-detail-top hd-detail-hero" aria-label="خلاصهٔ فایل">
          <div className="property-detail-top-gallery hd-gallery-column">
            <Gallery property={property} />
            <div className="hd-gallery-caption">
              <span><ShieldCheck size={16} aria-hidden="true" /> اطلاعات بر اساس مشخصات ثبت‌شدهٔ فایل</span>
              {code ? <span className="hd-file-code">کد فایل <bdi dir="ltr">{code}</bdi></span> : null}
            </div>
          </div>

          <div className="property-detail-summary hd-summary-card">
            <div className="hd-summary-kicker">
              <span className="hd-type-pill">{transactionLabel}</span>
              <span>{typeLabel}</span>
              {isFeaturedActive(property) ? <span className="hd-featured-pill">فایل ویژه</span> : null}
            </div>

            <h1 className="property-detail-title-block">{title}</h1>
            {locationLabel ? <p className="hd-location-line"><MapPin size={18} aria-hidden="true" /><span>{locationLabel}</span></p> : null}

            <div className="hd-status-line">
              <span className={"hd-status-dot" + (property.availabilityStatus === "available" ? " is-available" : "")} />
              <span>{status}</span>
              {publishedDate ? <span className="hd-date"><CalendarDays size={15} aria-hidden="true" /> انتشار: {publishedDate}</span> : null}
            </div>

            <div className="property-price-block hd-price-card">
              <span className="hd-price-eyebrow">قیمت و شرایط معامله</span>
              {prices.length ? (
                <div className="hd-price-lines">
                  {prices.map((row) => (
                    <div className="hd-price-row" key={row.label}>
                      <span>{row.label}</span>
                      <strong dir="rtl">{row.value}</strong>
                    </div>
                  ))}
                </div>
              ) : <strong className="hd-price-contact">برای اطلاع از قیمت تماس بگیرید</strong>}
              {perMeter ? <small className="hd-per-meter">{perMeter}</small> : null}
            </div>

            <div className="hd-summary-facts" aria-label="مشخصات برجسته">
              {property.areaM2 != null ? <div><Ruler size={18} aria-hidden="true" /><span>متراژ</span><strong>{property.areaM2.toLocaleString("fa-IR")} متر</strong></div> : null}
              {["apartment", "villa", "heritage"].includes(property.propertyType) && property.bedrooms != null
                ? <div><BedDouble size={18} aria-hidden="true" /><span>خواب</span><strong>{property.bedrooms.toLocaleString("fa-IR")}</strong></div>
                : null}
              {property.builtYear != null && property.propertyType !== "land"
                ? <div><CalendarDays size={18} aria-hidden="true" /><span>سال ساخت</span><strong>{property.builtYear.toLocaleString("fa-IR", { useGrouping: false })}</strong></div>
                : null}
            </div>

            <div className="hd-primary-contact">
              <a href={telHref} className="hd-button hd-button-primary"><Phone size={18} aria-hidden="true" /> تماس با مشاور</a>
              {waHref ? <a href={waHref} className="hd-button hd-button-secondary" target="_blank" rel="noreferrer"><MessageCircle size={18} aria-hidden="true" /> پیام در واتساپ</a> : null}
            </div>

            <div className="hd-actions-wrap">
              <div className="hd-actions-heading">ابزارهای فایل</div>
              <PropertyActions property={property} />
            </div>
            <p className="hd-contact-note">برای هماهنگی بازدید و دریافت جزئیات تکمیلی، با مشاور فایل تماس بگیرید.</p>
          </div>
        </section>

        <div className="property-detail-content hd-content-grid">
          <div className="property-detail-main hd-main-column">
            <section className="hd-section hd-spec-section" aria-labelledby="hd-spec-heading">
              <div className="hd-section-heading">
                <div><span className="hd-section-eyebrow">اطلاعات ثبت‌شده</span><h2 id="hd-spec-heading">مشخصات ملک</h2></div>
                <span className="hd-section-count">{specs.length.toLocaleString("fa-IR")} مورد</span>
              </div>
              <details className="property-specs-accordion hd-spec-accordion" open>
                <summary><span>مشخصات اصلی</span><ChevronLeft size={19} aria-hidden="true" /></summary>
                <div className="property-specs-accordion-body hd-spec-grid">
                  {specs.length ? specs.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div className="hd-spec-item" key={item.label}>
                        <span className="hd-spec-icon"><Icon size={18} aria-hidden="true" /></span>
                        <span className="hd-spec-label">{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    );
                  }) : <p className="hd-empty-inline">مشخصات تکمیلی برای این فایل ثبت نشده است.</p>}
                </div>
              </details>
              {features.length ? (
                <details className="property-spec-amenities hd-amenity-accordion">
                  <summary><span>امکانات و ویژگی‌ها</span><ChevronLeft size={19} aria-hidden="true" /></summary>
                  <ul className="hd-feature-list">
                    {features.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" /><span>{feature}</span></li>)}
                  </ul>
                </details>
              ) : null}
            </section>

            <section className="property-detail-body hd-section hd-description" aria-labelledby="hd-description-heading">
              <div className="hd-section-heading">
                <div><span className="hd-section-eyebrow">شرح و توضیحات</span><h2 id="hd-description-heading">شرح کامل ملک</h2></div>
              </div>
              {cleanText(property.description) ? (
                <div className="hd-description-copy">
                  {property.description.split(/\n\s*\n/).map((paragraph, index) => cleanText(paragraph) ? <p key={index}>{paragraph.trim()}</p> : null)}
                </div>
              ) : <p className="hd-empty-inline">برای این فایل توضیحی ثبت نشده است. برای دریافت اطلاعات تکمیلی با مشاور تماس بگیرید.</p>}
              <div className="hd-updated-meta">
                {publishedDate ? <span><CalendarDays size={15} aria-hidden="true" /> تاریخ انتشار: {publishedDate}</span> : null}
                {updatedDate ? <span><Clock3 size={15} aria-hidden="true" /> آخرین به‌روزرسانی: {updatedDate}</span> : null}
              </div>
            </section>

            {property.virtualTourUrl || property.floorPlanUrl ? (
              <section className="hd-section hd-extra-media" aria-labelledby="hd-extra-heading">
                <div className="hd-section-heading"><div><span className="hd-section-eyebrow">رسانه‌های تکمیلی</span><h2 id="hd-extra-heading">بازدید و نقشهٔ داخلی</h2></div></div>
                <div className="hd-extra-links">
                  {property.virtualTourUrl ? <a href={property.virtualTourUrl} target="_blank" rel="noreferrer"><ExternalLink size={18} aria-hidden="true" /><span><strong>مشاهدهٔ بازدید مجازی</strong><small>در صفحه‌ای جداگانه باز می‌شود</small></span><ArrowLeft size={17} aria-hidden="true" /></a> : null}
                  {property.floorPlanUrl ? <a href={property.floorPlanUrl} target="_blank" rel="noreferrer"><Layers3 size={18} aria-hidden="true" /><span><strong>مشاهدهٔ پلان ملک</strong><small>نقشهٔ ثبت‌شده برای این فایل</small></span><ArrowLeft size={17} aria-hidden="true" /></a> : null}
                </div>
              </section>
            ) : null}

            <section className="property-location-section hd-section hd-location-section" aria-labelledby="hd-location-heading">
              <div className="hd-section-heading">
                <div><span className="hd-section-eyebrow">محله و دسترسی</span><h2 id="hd-location-heading">موقعیت تقریبی فایل روی نقشه</h2></div>
                <MapPinned size={23} aria-hidden="true" />
              </div>
              {locationDescription ? <p className="hd-location-description"><MapPin size={17} aria-hidden="true" /> {locationDescription}</p> : <p className="hd-empty-inline">موقعیت یا نام محله برای این فایل ثبت نشده است.</p>}
              {exactCoordinates ? (
                <div className="hd-map-frame">
                  <iframe src={osmEmbedUrl(property.latitude as number, property.longitude as number)} title={"موقعیت تقریبی ملک " + title} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                  <p>نشانگر بر اساس مختصات ذخیره‌شده نمایش داده شده است؛ موقعیت را پیش از بازدید بررسی کنید.</p>
                </div>
              ) : (
                <div className="hd-map-fallback">
                  <MapPinned size={26} aria-hidden="true" />
                  <div><strong>نقشهٔ نقطه‌ای در دسترس نیست</strong><p>برای جلوگیری از نمایش موقعیت ساختگی، مختصات ثبت‌نشده روی نقشه علامت‌گذاری نشده است.</p></div>
                </div>
              )}
              {(exactCoordinates || locationDescription) ? (
                <a className="hd-map-link" href={mapOpenUrl(property, exactCoordinates)} target="_blank" rel="noreferrer">
                  <ExternalLink size={17} aria-hidden="true" /> {exactCoordinates ? "باز کردن موقعیت در نقشه" : "جست‌وجوی محدوده در نقشه"}
                </a>
              ) : null}
            </section>

            <section className="hd-before-contact" aria-labelledby="hd-before-contact-heading">
              <div className="hd-before-icon"><Info size={21} aria-hidden="true" /></div>
              <div>
                <h2 id="hd-before-contact-heading">قبل از تماس، این‌ها را بدانید</h2>
                <p>مبلغ نهایی، شرایط معامله، وضعیت فعلی فایل و زمان بازدید را پیش از تصمیم‌گیری با مشاور هماهنگ کنید. اطلاعات این صفحه بر پایهٔ موارد ثبت‌شده برای فایل است و جایگزین بررسی حضوری و توافق طرفین نیست.</p>
              </div>
            </section>

            <div className="hd-back-row">
              <Link to="/properties" className="hd-back-link"><ArrowRight size={18} aria-hidden="true" /> بازگشت به فهرست فایل‌ها</Link>
              <button type="button" className="hd-copy-link" onClick={() => void copyPageUrl()}>
                {copied ? <Check size={17} aria-hidden="true" /> : <ExternalLink size={17} aria-hidden="true" />}
                {copied ? "پیوند کپی شد" : "کپی پیوند فایل"}
              </button>
            </div>
          </div>

          <aside className="hd-aside-column" aria-label="اطلاعات تماس">
            <section className="hd-consultant-card">
              <span className="hd-consultant-kicker">پاسخ‌گوی فایل</span>
              <div className="hd-consultant-avatar" aria-hidden="true"><Building2 size={24} /></div>
              <h2>{contactName}</h2>
              <p>{contactName === SITE.nameFa ? "دفتر املاک هیرمند" : "مشاور این فایل"}</p>
              <a className="hd-consultant-phone" href={telHref} dir="ltr"><Phone size={17} aria-hidden="true" /> {phone === SITE.phone.mobile ? SITE.phone.mobileDisplay : phone}</a>
              <div className="hd-consultant-actions">
                <a href={telHref} className="hd-button hd-button-primary"><Phone size={17} aria-hidden="true" /> تماس</a>
                {waHref ? <a href={waHref} className="hd-button hd-button-secondary" target="_blank" rel="noreferrer"><MessageCircle size={17} aria-hidden="true" /> واتساپ</a> : null}
              </div>
              <p className="hd-consultant-note">پاسخگویی با هماهنگی قبلی</p>
            </section>

            <section className="hd-aside-note">
              <ShieldCheck size={20} aria-hidden="true" />
              <div><strong>پیش از بازدید</strong><p>جزئیات ثبت‌شده، شرایط پرداخت و زمان بازدید را از مشاور سؤال کنید.</p></div>
            </section>

            {publishedDate || updatedDate ? (
              <section className="hd-aside-meta">
                <h2>زمان‌بندی فایل</h2>
                {publishedDate ? <p><CalendarDays size={16} aria-hidden="true" /><span>انتشار</span><strong>{publishedDate}</strong></p> : null}
                {updatedDate ? <p><Clock3 size={16} aria-hidden="true" /><span>به‌روزرسانی</span><strong>{updatedDate}</strong></p> : null}
              </section>
            ) : null}
          </aside>
        </div>

        {relatedItems.length ? (
          <section className="hd-related-section" aria-labelledby="hd-related-heading">
            <div className="hd-section-heading">
              <div><span className="hd-section-eyebrow">انتخاب‌های نزدیک</span><h2 id="hd-related-heading">فایل‌های مشابه</h2></div>
              <Link to="/properties" className="hd-all-related">مشاهدهٔ همه <ArrowLeft size={16} aria-hidden="true" /></Link>
            </div>
            <div className="hd-related-grid">{relatedItems.map((item) => <RelatedPropertyCard property={item} key={item.id} />)}</div>
          </section>
        ) : null}
      </main>

      <div className="property-mobile-actions hd-mobile-actions" aria-label="اقدام‌های تماس">
        <a href={telHref} className="hd-mobile-call"><Phone size={19} aria-hidden="true" /><span>تماس</span></a>
        {waHref ? <a href={waHref} className="hd-mobile-whatsapp" target="_blank" rel="noreferrer"><MessageCircle size={19} aria-hidden="true" /><span>واتساپ</span></a> : null}
        <button type="button" onClick={() => void copyPageUrl()} aria-label="کپی پیوند فایل">
          {copied ? <Check size={19} aria-hidden="true" /> : <ExternalLink size={19} aria-hidden="true" />}
          <span>{copied ? "کپی شد" : "اشتراک"}</span>
        </button>
      </div>
    </SiteChrome>
  );
}
