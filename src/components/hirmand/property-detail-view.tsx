import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
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
  Maximize2,
  MessageCircle,
  Phone,
  Play,
  Ruler,
  ShieldCheck,
  Warehouse,
  X,
} from "lucide-react";
import { getPropertyFeatureIcon } from "@/lib/property-amenity-icons";
import { PropertyActions } from "@/components/hirmand/property-actions";
import { PropertyConvertSlider } from "@/components/hirmand/property-convert-slider";
import { PropertyMarketComparison } from "@/components/hirmand/property-market-comparison";
import { PropertyViewingRequest } from "@/components/hirmand/property-viewing-request";
import { PropertyVirtualTour } from "@/components/hirmand/property-virtual-tour";
import { PropertyVideoPlayer } from "@/components/hirmand/property-video-player";
import { PropertyQuestions } from "@/components/hirmand/property-questions";
import { PropertyOpenHouse } from "@/components/hirmand/property-open-house";
import { PropertyFloorPlan } from "@/components/hirmand/property-floor-plan";
import { PropertyNearbyServices } from "@/components/hirmand/property-nearby-services";
import { PropertyDocumentRequest } from "@/components/hirmand/property-document-request";
import { PropertyBackInMarketAlert } from "@/components/hirmand/property-back-in-market-alert";
import { PropertyFinancingRequest } from "@/components/hirmand/property-financing-request";
import { PropertyPrepBudget } from "@/components/hirmand/property-prep-budget";
import { PropertyTargetAlert } from "@/components/hirmand/property-target-alert";
import { PropertyVerificationRequest } from "@/components/hirmand/property-verification-request";
import { PropertyVerificationStamp } from "@/components/hirmand/property-verification-stamp";
import { PropertyExpertRequests } from "@/components/hirmand/property-expert-requests";
import { PropertyNeighborhoodInsight } from "@/components/hirmand/property-neighborhood-insight";
import { PropertyReport } from "@/components/hirmand/property-report";
import { PropertyCallbackRequest } from "@/components/hirmand/property-callback-request";
import { PropertyDecisionTools } from "@/components/hirmand/property-decision-tools";
import { PropertyVisitChecklist } from "@/components/hirmand/property-visit-checklist";
import { PropertyOfferMessage } from "@/components/hirmand/property-offer-message";
import { PropertyPaymentPlanner } from "@/components/hirmand/property-payment-planner";
import { PropertyDealChecklist } from "@/components/hirmand/property-deal-checklist";
import { PropertyScenarioAnalysis } from "@/components/hirmand/property-scenario-analysis";
import { PropertyPersonalScore } from "@/components/hirmand/property-personal-score";
import { PropertyVisitOutcome } from "@/components/hirmand/property-visit-outcome";
import { PropertyReviewAlerts } from "@/components/hirmand/property-review-alerts";
import { PropertyFollowUpReminder } from "@/components/hirmand/property-follow-up-reminder";
import { PropertyDecisionDossier } from "@/components/hirmand/property-decision-dossier";
import { PropertyInquiryTools } from "@/components/hirmand/property-inquiry-tools";
import { PropertyQuestionLog } from "@/components/hirmand/property-question-log";
import { PropertyRenovationTracker } from "@/components/hirmand/property-renovation-tracker";
import { PropertyVisitReport } from "@/components/hirmand/property-visit-report";
import { PropertyNegotiationLog } from "@/components/hirmand/property-negotiation-log";
import { PropertyOwnershipCost } from "@/components/hirmand/property-ownership-cost";
import { PropertyDealRoom } from "@/components/hirmand/property-deal-room";
import { PropertyRiskRadar } from "@/components/hirmand/property-risk-radar";
import { PropertyDocumentPack } from "@/components/hirmand/property-document-pack";
import { PropertyPhotoNotes } from "@/components/hirmand/property-photo-notes";
import { PropertyDecisionReadiness } from "@/components/hirmand/property-decision-readiness";
import { getPublishedPropertyPriceHistory, isFeaturedActive, type PropertyPriceHistoryItem } from "@/lib/properties";
import "@/property-price-history.css";
import "@/property-feature-enhancements.css";
import "@/property-new-features.css";
import "@/property-next-features.css";
import "@/property-target-and-trust.css";
import "@/property-expert-requests.css";
import "@/property-decision-dossier.css";
import "@/property-question-log.css";
import "@/property-negotiation-log.css";
import "@/property-ownership-cost.css";
import "@/property-renovation-tracker.css";
import "@/property-photo-notes.css";
import "@/property-decision-readiness.css";
import "@/property-document-pack.css";
import "@/property-risk-radar.css";
import "@/property-deal-room.css";
import "@/property-detail-page.css";
import "@/property-detail-page-luxury.css";
import "@/property-detail-page-pro-v2.css";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import type { Property } from "@/lib/properties";
import { getPropertyFallbackImages, isPropertyFallbackImage } from "@/lib/property-fallback-images";
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
import "@/property-gallery-mobile.css";
import "@/property-detail-responsive-system.css";
import "@/property-detail-professional.css";

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
  const deposit = parseAmount(cleanText(property.deposit)) > 0 ? moneyLabel(property.deposit) : "";
  const rent = parseAmount(cleanText(property.rent)) > 0 ? moneyLabel(property.rent) : "";
  const price = parseAmount(cleanText(property.price)) > 0 ? moneyLabel(property.price) : "";
  const rows: PriceLine[] = [];

  if (property.transactionType === "rent") {
    if (deposit) rows.push({ label: "مبلغ رهن", value: deposit + " تومان" });
    if (rent) rows.push({ label: "اجارهٔ ماهانه", value: rent + " تومان" });
  } else if (property.transactionType === "mortgage") {
    if (deposit) rows.push({ label: "مبلغ رهن", value: deposit + " تومان" });
  } else if (price) {
    rows.push({
      label: property.transactionType === "sell" ? "قیمت فروش" : "قیمت خرید",
      value: price + " تومان",
    });
  }

  return rows;
}

function pricePerMeter(property: Property): string {
  if (property.transactionType !== "buy" && property.transactionType !== "sell") return "";
  const rawPrice = cleanText(property.price);
  if (property.areaM2 == null || property.areaM2 <= 0 || !rawPrice) return "";
  const amount = parseAmount(rawPrice);
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
  const international = value.startsWith("0098")
    ? value.slice(2)
    : value.startsWith("98")
      ? value
      : value.startsWith("0")
        ? "98" + value.slice(1)
        : value;
  return /^989\d{9}$/.test(international) ? international : "";
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
  fallbackSrc,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  fallbackSrc?: string;
}) {
  const candidates = useMemo(() => mediaSourceCandidates(src, fallbackSrc), [src, fallbackSrc]);
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
  const storedImages = useMemo(
    () => [...new Set((property.images ?? []).map(cleanText).filter(Boolean))],
    [property.images],
  );
  const propertyImages = useMemo(
    () => storedImages.filter((src) => !isPropertyFallbackImage(src)),
    [storedImages],
  );
  // Real listing photos always take precedence. If there are none, use the
  // whole local JPG set for the property's category; old SVG fallbacks stored
  // in earlier records must not override the real-photo gallery.
  const categoryFallbackImages = useMemo(
    () => getPropertyFallbackImages(property.propertyType),
    [property.propertyType],
  );
  const images = propertyImages.length ? propertyImages : categoryFallbackImages;
  const fallbackForImage = (src: string, index: number) => {
    if (!isPropertyFallbackImage(src)) return undefined;
    const alternatives = categoryFallbackImages.filter((candidate) => candidate !== src);
    return alternatives.length ? alternatives[index % alternatives.length] : undefined;
  };
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

  const renderMedia = (src: string, alt: string, priority = false, fallbackSrc?: string) => {
    if (isVideoUrl(src)) {
      const candidates = mediaSourceCandidates(src);
      return (
        <PropertyVideoPlayer
          className="hd-gallery-video"
          src={candidates[0] || src}
          title={"ویدئوی فایل " + alt}
          preload={priority ? "metadata" : "none"}
        />
      );
    }
    return <picture className="hd-gallery-picture"><PropertyImage src={src} alt={alt} className="hd-gallery-image" priority={priority} fallbackSrc={fallbackSrc} /></picture>;
  };

  return (
    <section className="hd-gallery-section" aria-label="گالری تصاویر ملک">
      <div className="property-gallery-wrap hd-gallery-wrap" role="region" aria-label={"گالری تصاویر " + property.title}>
        <div className="property-gallery hd-gallery">
          <div className="property-gallery-main hd-gallery-main">
            {current ? (
              <>
                <div className="hd-gallery-stage">
                  {renderMedia(current, property.title, true, fallbackForImage(current, activeIndexSafe))}
                  {!currentIsVideo ? (
                    <button
                      type="button"
                      className="hd-gallery-expand property-gallery-open"
                      onClick={() => setLightboxOpen(true)}
                      aria-label="نمایش تصویر در اندازهٔ بزرگ"
                    >
                      <span className="hd-gallery-expand-icon" aria-hidden="true">
                        <Maximize2 size={17} strokeWidth={2.1} />
                      </span>
                      <span className="hd-gallery-expand-label">بزرگ‌نمایی تصویر</span>
                    </button>
                  ) : null}
                </div>
                <div className="hd-gallery-controls">
                  <button type="button" onClick={() => move(-1)} aria-label="تصویر قبلی" disabled={images.length < 2}>
                    <ChevronRight size={18} />
                  </button>
                  <span className="property-gallery-counter" aria-live="polite" aria-atomic="true">
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

          {images.length > 1 ? (
            <div className="property-gallery-thumbs property-gallery-rail hd-gallery-thumbs" aria-label="انتخاب تصویر">
              <div className="hd-gallery-thumbs-heading" aria-hidden="true">
                <span className="hd-gallery-thumbs-heading-title">تصاویر بیشتر این ملک</span>
                <span className="hd-gallery-thumbs-heading-count">{images.length.toLocaleString("fa-IR")} تصویر</span>
              </div>
              {images.map((src, index) => {
                const isActive = index === activeIndexSafe;
                return (
                  <button
                    className={"property-gallery-thumb hd-gallery-thumb" + (isActive ? " is-active" : "")}
                    key={src}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    aria-label={"نمایش تصویر " + (index + 1).toLocaleString("fa-IR")}
                    aria-pressed={isActive}
                    aria-current={isActive ? "true" : undefined}
                    data-gallery-index={index + 1}
                  >
                    <span className="hd-gallery-thumb-preview" aria-hidden="true">
                      {isVideoUrl(src) ? (
                        <span className="hd-video-thumb">
                          <Play size={14} fill="currentColor" aria-hidden="true" />
                          <span>ویدئو</span>
                        </span>
                      ) : (
                        <PropertyImage src={src} alt="" fallbackSrc={fallbackForImage(src, index)} />
                      )}
                    </span>
                    <span className="hd-gallery-thumb-info" aria-hidden="true">
                      <span className="hd-gallery-thumb-title">تصویر { (index + 1).toLocaleString("fa-IR") }</span>
                      <span className="hd-gallery-thumb-description">
                        {isActive ? "در حال نمایش" : "برای مشاهده انتخاب کنید"}
                      </span>
                    </span>
                    <span className="hd-gallery-thumb-status" aria-hidden="true">
                      {isActive ? <Check size={16} strokeWidth={2.5} /> : <ChevronLeft size={16} />}
                    </span>
                  </button>
                );
              })}
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
              <div className="hd-lightbox-media"><PropertyImage src={current} alt={property.title} priority fallbackSrc={fallbackForImage(current, activeIndexSafe)} /></div>
              <div className="hd-lightbox-count">تصویر {(activeIndexSafe + 1).toLocaleString("fa-IR")} از {images.length.toLocaleString("fa-IR")}</div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function RelatedPropertyCard({ property }: { property: Property }) {
  const realImage = (property.images ?? []).find((src) => cleanText(src) && !isPropertyFallbackImage(src) && !isVideoUrl(src));
  // Related cards should use the same local category photos as the main gallery
  // when a listing has no uploaded photos, rather than showing a false empty state.
  const image = realImage || getPropertyFallbackImages(property.propertyType)[0];
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
  const [priceHistory, setPriceHistory] = useState<PropertyPriceHistoryItem[]>([]);
  const [priceWatchEnabled, setPriceWatchEnabled] = useState(false);
  const [priceWatchBusy, setPriceWatchBusy] = useState(false);

  useEffect(() => {
    if (!property) return;
    try {
      const key = "hirmand-viewed:" + property.slug;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      const recentKey = "hirmand-recent-properties";
      try {
        const parsed: unknown = JSON.parse(localStorage.getItem(recentKey) || "[]");
        const recent = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item !== property.slug) : [];
        localStorage.setItem(recentKey, JSON.stringify([property.slug, ...recent].slice(0, 8)));
      } catch { /* Recent history is optional. */ }
      trackAnalyticsEvent("property_view", property.slug);
    } catch {
      // Storage can be disabled in private mode; tracking must not break the page.
    }
  }, [property]);

  useEffect(() => {
    const slug = property?.slug;
    if (!slug) {
      setPriceHistory([]);
      setPriceWatchEnabled(false);
      return;
    }
    let cancelled = false;
    void getPublishedPropertyPriceHistory({ data: { slug } })
      .then((items) => { if (!cancelled) setPriceHistory(items); })
      .catch(() => { if (!cancelled) setPriceHistory([]); });
    void fetch("/api/property-watch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "sync" }),
    })
      .then((response) => response.ok ? response.json() as Promise<{ subscriptions?: Array<{ slug: string }> }> : null)
      .then((payload) => { if (!cancelled) setPriceWatchEnabled(Boolean(payload?.subscriptions?.some((item) => item.slug === slug))); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [property?.slug, property?.price, property?.deposit, property?.rent]);

  const togglePriceWatch = async () => {
    if (!property?.slug || priceWatchBusy) return;
    const action = priceWatchEnabled ? "unsubscribe" : "subscribe";
    setPriceWatchBusy(true);
    try {
      const response = await fetch("/api/property-watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, slug: property.slug }),
      });
      if (!response.ok) throw new Error("watch request failed");
      setPriceWatchEnabled(action === "subscribe");
      trackAnalyticsEvent("property_price_watch", property.slug);
      toast.success(action === "subscribe" ? "پیگیری قیمت این فایل فعال شد." : "پیگیری قیمت این فایل خاموش شد.");
    } catch {
      toast.error("ثبت پیگیری قیمت انجام نشد؛ دوباره تلاش کنید.");
    } finally {
      setPriceWatchBusy(false);
    }
  };

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

  const title = (cleanText(property.title) || "جزئیات فایل ملک")
    .replace(/\s*[|｜]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(\d+)\s*متر(?=\s|$|[،؛.,])/g, "$1 متری")
    .replace(/(\d+)\s*خواب(?=\s|$|[،؛.,])/g, "$1 خوابه")
    .replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
  const typeLabel = PROPERTY_TYPE_LABEL[property.propertyType];
  const transactionLabel = TRANSACTION_LABEL[property.transactionType];
  const locationParts = [cleanText(property.neighborhood), cleanText(property.city)].filter(Boolean);
  const locationLabel = locationParts.join("، ");
  const locationDescription = [cleanText(property.address), ...locationParts].filter(Boolean).join("، ");
  const exactCoordinates = hasValidCoordinates(property.latitude, property.longitude);
  const publishedDate = formatDate(property.publishedAt || property.createdAt);
  const updatedDate = formatDate(property.updatedAt);
  const descriptionParagraphs = cleanText(property.description)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const expandableDescription = cleanText(property.description).length > 900 && descriptionParagraphs.length > 2;
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
              <button
                type="button"
                className={"hd-price-watch-button" + (priceWatchEnabled ? " is-active" : "")}
                onClick={() => void togglePriceWatch()}
                aria-pressed={priceWatchEnabled}
                disabled={priceWatchBusy}
              >
                <Clock3 size={16} aria-hidden="true" />
                {priceWatchBusy ? "در حال ثبت…" : priceWatchEnabled ? "پیگیری تغییر قیمت فعال است" : "پیگیری تغییر قیمت"}
              </button>
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
              <a href={telHref} onClick={() => trackAnalyticsEvent("call_click", property.slug)} className="hd-button hd-button-primary"><Phone size={18} aria-hidden="true" /> تماس با مشاور</a>
              {waHref ? <a href={waHref} onClick={() => trackAnalyticsEvent("whatsapp_click", property.slug)} className="hd-button hd-button-secondary" target="_blank" rel="noreferrer"><MessageCircle size={18} aria-hidden="true" /> پیام در واتساپ</a> : null}
            </div>

            <div className="hd-callback-request">
              <PropertyCallbackRequest propertyType={typeLabel} neighborhood={property.neighborhood} context={"فایل «" + title + "»"} />
            </div>

            <div className="hd-actions-wrap">
              <div className="hd-actions-heading">ابزارهای فایل</div>
              <div className="pcard-actions" aria-label="عملیات فایل">
                <PropertyActions property={property} compact />
              </div>
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
                    {features.map((feature) => {
                      const Icon = getPropertyFeatureIcon(feature);
                      return (
                        <li key={feature}>
                          <span className="hd-feature-icon" aria-hidden="true"><Icon size={18} /></span>
                          <span>{feature}</span>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              ) : null}
            </section>

            <section className="hd-insight-grid" aria-label="اطلاعات تحلیلی فایل">
              <PropertyVerificationStamp property={property} />
              <PropertyMarketComparison property={property} />
            </section>

            {priceHistory.length ? (
              <section id="property-price-history-section" className="property-price-history hd-section" aria-labelledby="hd-price-history-heading">
                <div className="hd-section-heading">
                  <div><span className="hd-section-eyebrow">شفافیت قیمت</span><h2 id="hd-price-history-heading">روند تغییر قیمت و شرایط مالی</h2></div>
                  <span className="hd-section-count">{priceHistory.length.toLocaleString("fa-IR")} تغییر ثبت‌شده</span>
                </div>
                <div className="property-price-history-list">
                  {priceHistory.slice(0, 2).map((item, index) => (
                    <article className="property-price-history-item" key={item.changedAt + "-" + index}>
                      <div className="property-price-history-date"><Clock3 size={16} aria-hidden="true" /><time dateTime={item.changedAt}>{formatDate(item.changedAt)}</time></div>
                      <div className="property-price-history-changes">
                        {item.previousPrice !== item.newPrice ? (
                          <div className="property-price-history-change"><span>قیمت کل</span><strong>{item.previousPrice ? moneyLabel(item.previousPrice) + " تومان" : "ثبت نشده"}</strong><b>←</b><strong className="is-current">{item.newPrice ? moneyLabel(item.newPrice) + " تومان" : "حذف شد"}</strong></div>
                        ) : null}
                        {item.previousDeposit !== item.newDeposit ? (
                          <div className="property-price-history-change"><span>رهن</span><strong>{item.previousDeposit ? moneyLabel(item.previousDeposit) + " تومان" : "ثبت نشده"}</strong><b>←</b><strong className="is-current">{item.newDeposit ? moneyLabel(item.newDeposit) + " تومان" : "حذف شد"}</strong></div>
                        ) : null}
                        {item.previousRent !== item.newRent ? (
                          <div className="property-price-history-change"><span>اجاره</span><strong>{item.previousRent ? moneyLabel(item.previousRent) + " تومان" : "ثبت نشده"}</strong><b>←</b><strong className="is-current">{item.newRent ? moneyLabel(item.newRent) + " تومان" : "حذف شد"}</strong></div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
                {priceHistory.length > 2 ? (
                  <details className="property-price-history-more">
                    <summary><span>مشاهدهٔ تمام تغییرات قیمت</span><small>{(priceHistory.length - 2).toLocaleString("fa-IR")} مورد دیگر</small><ChevronLeft size={16} aria-hidden="true" /></summary>
                    <div className="property-price-history-list">
                      {priceHistory.slice(2).map((item, index) => (
                        <article className="property-price-history-item" key={item.changedAt + "-more-" + index}>
                          <div className="property-price-history-date"><Clock3 size={16} aria-hidden="true" /><time dateTime={item.changedAt}>{formatDate(item.changedAt)}</time></div>
                          <div className="property-price-history-changes">
                            {item.previousPrice !== item.newPrice ? <div className="property-price-history-change"><span>قیمت کل</span><strong>{item.previousPrice ? moneyLabel(item.previousPrice) + " تومان" : "ثبت نشده"}</strong><b>←</b><strong className="is-current">{item.newPrice ? moneyLabel(item.newPrice) + " تومان" : "حذف شد"}</strong></div> : null}
                            {item.previousDeposit !== item.newDeposit ? <div className="property-price-history-change"><span>رهن</span><strong>{item.previousDeposit ? moneyLabel(item.previousDeposit) + " تومان" : "ثبت نشده"}</strong><b>←</b><strong className="is-current">{item.newDeposit ? moneyLabel(item.newDeposit) + " تومان" : "حذف شد"}</strong></div> : null}
                            {item.previousRent !== item.newRent ? <div className="property-price-history-change"><span>اجاره</span><strong>{item.previousRent ? moneyLabel(item.previousRent) + " تومان" : "ثبت نشده"}</strong><b>←</b><strong className="is-current">{item.newRent ? moneyLabel(item.newRent) + " تومان" : "حذف شد"}</strong></div> : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  </details>
                ) : null}
                <p className="property-price-history-note">این سابقه فقط تغییرات ثبت‌شده در سامانه هیرمند را نشان می‌دهد و جایگزین بررسی شرایط نهایی معامله نیست.</p>
              </section>
            ) : null}

            <section className="property-detail-body hd-section hd-description" aria-labelledby="hd-description-heading">
              <div className="hd-section-heading">
                <div><span className="hd-section-eyebrow">شرح و توضیحات</span><h2 id="hd-description-heading">شرح کامل ملک</h2></div>
              </div>
              {cleanText(property.description) ? (
                <div className="hd-description-copy">
                  {(expandableDescription ? descriptionParagraphs.slice(0, 2) : descriptionParagraphs).map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                  {expandableDescription ? (
                    <details className="hd-description-more">
                      <summary>ادامهٔ توضیحات ملک</summary>
                      {descriptionParagraphs.slice(2).map((paragraph, index) => (
                        <p key={`more-${index}`}>{paragraph}</p>
                      ))}
                    </details>
                  ) : null}
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

            <PropertyFloorPlan property={property} />
            <PropertyNearbyServices property={property} />

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
              {(property.availabilityStatus === "available" || property.availabilityStatus === "reserved") ? (
                <div className="hd-viewing-request"><PropertyViewingRequest property={{ id: property.id, slug: property.slug, title: property.title, neighborhood: property.neighborhood, availabilityStatus: property.availabilityStatus }} /></div>
              ) : null}
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

        <section id="property-tools-section" className="hd-section property-tool-center" aria-labelledby="hd-tool-center-heading">
          <div className="hd-section-heading">
            <div><span className="hd-section-eyebrow">ابزارهای تکمیلی</span><h2 id="hd-tool-center-heading">ابزارهای هوشمند این فایل</h2></div>
            <span className="hd-section-count">اختیاری</span>
          </div>
          <p className="hd-tools-intro">ابزارهای عملی سامانه برای بررسی، هماهنگی بازدید، درخواست مدارک و مدیریت تصمیم‌گیری در دسترس‌اند. هر بخش را فقط در صورت نیاز باز کنید.</p>

          <details className="property-secondary-services">
            <summary className="property-secondary-services-summary"><span className="property-secondary-services-main"><strong>خدمات تکمیلی فایل</strong><small>مدارک، گزارش ایراد، بازدید، تأمین مالی و وضعیت انتشار</small></span><ChevronLeft size={18} aria-hidden="true" /></summary>
            <div className="property-secondary-services-content hd-tools-stack">
              {["sold", "rented", "unavailable"].includes(property.availabilityStatus) ? <PropertyBackInMarketAlert slug={property.slug} title={property.title} availabilityStatus={property.availabilityStatus} /> : null}
              {(property.transactionType === "buy" || property.transactionType === "sell") ? <PropertyFinancingRequest property={property} /> : null}
              <PropertyPrepBudget property={property} />
              <PropertyTargetAlert property={property} />
              <PropertyVerificationRequest property={property} />
              <PropertyExpertRequests property={property} />
              <PropertyDocumentRequest property={property} />
              <PropertyVirtualTour property={property} />
              <PropertyNeighborhoodInsight property={property} />
              <PropertyReport property={property} />
              <PropertyQuestions property={property} />
              <PropertyOpenHouse property={property} />
            </div>
          </details>

          <details className="property-tool-category">
            <summary className="property-tool-category-summary"><span className="property-tool-category-main"><span className="property-tool-category-index">۰۱</span><span className="property-tool-category-copy"><strong>بررسی و تصمیم‌گیری</strong><span>چک‌لیست بازدید، ارزیابی تناسب، سناریو و بررسی ریسک</span></span></span><span className="property-tool-category-meta"><span className="property-tool-category-count">۸ ابزار</span><ChevronLeft size={17} aria-hidden="true" /></span></summary>
            <div className="property-tool-category-content"><div className="property-tool-category-content-inner hd-tools-stack"><PropertyDecisionTools property={property} /><PropertyVisitChecklist property={property} /><PropertyDecisionReadiness property={property} /><PropertyScenarioAnalysis property={property} /><PropertyPersonalScore property={property} /><PropertyRiskRadar property={property} /><PropertyReviewAlerts property={property} /><PropertyVisitOutcome property={property} /></div></div>
          </details>

          <details className="property-tool-category">
            <summary className="property-tool-category-summary"><span className="property-tool-category-main"><span className="property-tool-category-index">۰۲</span><span className="property-tool-category-copy"><strong>مالی و محاسبات معامله</strong><span>هزینه‌های مالکیت، برنامهٔ پرداخت و تبدیل رهن و اجاره</span></span></span><span className="property-tool-category-meta"><span className="property-tool-category-count">۳ ابزار</span><ChevronLeft size={17} aria-hidden="true" /></span></summary>
            <div className="property-tool-category-content"><div className="property-tool-category-content-inner hd-tools-stack"><PropertyOwnershipCost property={property} /><PropertyPaymentPlanner property={property} /><PropertyConvertSlider property={property} /></div></div>
          </details>

          <details className="property-tool-category">
            <summary className="property-tool-category-summary"><span className="property-tool-category-main"><span className="property-tool-category-index">۰۳</span><span className="property-tool-category-copy"><strong>مذاکره و آماده‌سازی معامله</strong><span>پیشنهاد، چک‌لیست توافق، اتاق معامله و پرونده تصمیم</span></span></span><span className="property-tool-category-meta"><span className="property-tool-category-count">۴ ابزار</span><ChevronLeft size={17} aria-hidden="true" /></span></summary>
            <div className="property-tool-category-content"><div className="property-tool-category-content-inner hd-tools-stack"><PropertyOfferMessage property={property} /><PropertyDealChecklist property={property} /><PropertyDealRoom property={property} /><PropertyDecisionDossier property={property} /></div></div>
          </details>

          <details className="property-tool-category">
            <summary className="property-tool-category-summary"><span className="property-tool-category-main"><span className="property-tool-category-index">۰۴</span><span className="property-tool-category-copy"><strong>مدارک و هماهنگی</strong><span>مدارک موردنیاز و ابزارهای پرسش و پیگیری</span></span></span><span className="property-tool-category-meta"><span className="property-tool-category-count">۲ ابزار</span><ChevronLeft size={17} aria-hidden="true" /></span></summary>
            <div className="property-tool-category-content"><div className="property-tool-category-content-inner hd-tools-stack"><PropertyDocumentPack property={property} /><PropertyInquiryTools property={property} /></div></div>
          </details>

          <details className="property-tool-category property-tool-personal">
            <summary className="property-tool-category-summary"><span className="property-tool-category-main"><span className="property-tool-category-index">۰۵</span><span className="property-tool-category-copy"><strong>دفتر شخصی این فایل</strong><span>یادداشت‌ها و پیگیری‌های شخصی شما دربارهٔ این ملک</span></span></span><span className="property-tool-category-meta"><span className="property-tool-category-count">۶ ابزار</span><ChevronLeft size={17} aria-hidden="true" /></span></summary>
            <div className="property-tool-category-content"><div className="property-tool-category-content-inner hd-tools-stack"><PropertyNegotiationLog property={property} /><PropertyFollowUpReminder property={property} /><PropertyQuestionLog property={property} /><PropertyVisitReport property={property} /><PropertyRenovationTracker property={property} /><PropertyPhotoNotes property={property} /></div></div>
          </details>
        </section>

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
        <a href={telHref} className="hd-mobile-call" onClick={() => trackAnalyticsEvent("call_click", property.slug)}><Phone size={19} aria-hidden="true" /><span>تماس</span></a>
        {waHref ? <a href={waHref} className="hd-mobile-whatsapp" onClick={() => trackAnalyticsEvent("whatsapp_click", property.slug)} target="_blank" rel="noreferrer"><MessageCircle size={19} aria-hidden="true" /><span>واتساپ</span></a> : null}
        <button type="button" onClick={() => void copyPageUrl()} aria-label="کپی پیوند فایل">
          {copied ? <Check size={19} aria-hidden="true" /> : <ExternalLink size={19} aria-hidden="true" />}
          <span>{copied ? "کپی شد" : "اشتراک"}</span>
        </button>
      </div>
    </SiteChrome>
  );
}
