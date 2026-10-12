import { Link } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from "react";
import {
  ArrowRight,
  ArrowDownRight,
  Accessibility,
  Armchair,
  Baby,
  Bell,
  Bath,
  Briefcase,
  BriefcaseBusiness,
  Camera,
  CarFront,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Play,
  Share2,
  Sparkles,
  BedDouble,
  Building2,
  CalendarDays,
  Check,
  DoorOpen,
  Droplets,
  Dumbbell,
  ExternalLink,
  Flame,
  Flower2,
  Gauge,
  Handshake,
  FastForward,
  Flag,
  Layers3,
  MapPinned,
  Home,
  KeyRound,
  Leaf,
  LockKeyhole,
  MonitorSmartphone,
  Navigation,
  PawPrint,
  Paintbrush,
  Pause,
  Wallpaper,
  Phone,
  Rewind,
  Ruler,
  ShieldCheck,
  Sofa,
  Sun,
  Trees,
  Utensils,
  Volume2,
  VolumeX,
  Warehouse,
  Waves,
  Wind,
  Wifi,
  Zap,
  X,
} from "lucide-react";
import { breadcrumbJsonLd, propertyJsonLd, TX_LABEL, TYPE_LABEL } from "@/lib/seo";
import type { Property } from "@/lib/properties";
import { PropertyConvertSlider } from "@/components/hirmand/property-convert-slider";
import { toast } from "sonner";
import { WhatsAppIcon } from "@/components/hirmand/social-icons";
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

const PROPERTY_AVAILABILITY_LABELS: Record<Property["availabilityStatus"], string> = {
  available: "موجود",
  reserved: "رزرو موقت",
  sold: "فروخته‌شده",
  rented: "اجاره‌داده‌شده",
  unavailable: "فعلاً ناموجود",
};

const PROPERTY_ORIENTATION_LABELS: Record<NonNullable<Property["orientation"]>, string> = {
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
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { PropertyCard } from "@/components/hirmand/property-showcase";
import { PropertyActions } from "@/components/hirmand/property-actions";
import { PropertyMarketComparison } from "@/components/hirmand/property-market-comparison";
import { PropertyViewingRequest } from "@/components/hirmand/property-viewing-request";
import { PropertyVirtualTour } from "@/components/hirmand/property-virtual-tour";
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
import { PropertyMediaWatermark } from "@/components/hirmand/property-media-watermark";
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
import "@/property-photo-notes.css";
import "@/property-decision-readiness.css";
import "@/property-document-pack.css";
import "@/property-risk-radar.css";
import "@/property-deal-room.css";
import { formatToman } from "@/lib/money";
import { formatPersianDate } from "@/lib/persian-date";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { isVideoUrl, mediaSourceCandidates } from "@/lib/media";
import { isPermanentlyWatermarkedMediaUrl, isPermanentlyWatermarkedVideoUrl } from "@/lib/property-watermark";
import { getPropertyFallbackImage, getPropertyFallbackImages, getPropertyFallbackLegacyImage, isPropertyFallbackImage } from "@/lib/property-fallback-images";
import { areaSlug } from "@/lib/areas";
import { SITE } from "@/lib/site";
import { propertyPath } from "@/lib/property-path";
import { useConsultants } from "@/components/hirmand/consultants-context";
import { getPublishedPropertyPriceHistory, isFeaturedActive, type PropertyPriceHistoryItem } from "@/lib/properties";
import {
  PROPERTY_CABINET_OPTIONS,
  PROPERTY_COOLING_OPTIONS,
  PROPERTY_FLOORING_OPTIONS,
  PROPERTY_HEATING_OPTIONS,
  PROPERTY_OTHER_AMENITY_OPTIONS,
  PROPERTY_WALL_CLOSET_OPTIONS,
  labelForOption,
} from "@/lib/property-options";

function propertyAmenityLabel(value: string) {
  if (value.startsWith("cooling:")) {
    return labelForOption(PROPERTY_COOLING_OPTIONS, value.slice("cooling:".length));
  }
  if (value.startsWith("heating:")) {
    return labelForOption(PROPERTY_HEATING_OPTIONS, value.slice("heating:".length));
  }
  return labelForOption(PROPERTY_OTHER_AMENITY_OPTIONS, value);
}

function propertyAmenityIcon(value: string) {
  switch (value) {
    case "cooling":
      return <Wind size={18} aria-hidden="true" />;
    case "heating":
      return <Flame size={18} aria-hidden="true" />;
    case "balcony":
      return <Home size={18} aria-hidden="true" />;
    case "terrace":
      return <Armchair size={18} aria-hidden="true" />;
    case "roof_garden":
      return <Trees size={18} aria-hidden="true" />;
    case "yard":
      return <Flower2 size={18} aria-hidden="true" />;
    case "private_yard":
      return <Leaf size={18} aria-hidden="true" />;
    case "patio":
      return <DoorOpen size={18} aria-hidden="true" />;
    case "roof_access":
      return <KeyRound size={18} aria-hidden="true" />;
    case "master_bedroom":
      return <Sofa size={18} aria-hidden="true" />;
    case "walk_in_closet":
      return <Warehouse size={18} aria-hidden="true" />;
    case "guest_room":
      return <BedDouble size={18} aria-hidden="true" />;
    case "laundry":
      return <Droplets size={18} aria-hidden="true" />;
    case "maid_room":
      return <Home size={18} aria-hidden="true" />;
    case "storage_room":
      return <Warehouse size={18} aria-hidden="true" />;
    case "double_glazed":
      return <Layers3 size={18} aria-hidden="true" />;
    case "soundproof":
      return <VolumeX size={18} aria-hidden="true" />;
    case "thermal_insulation":
      return <Wind size={18} aria-hidden="true" />;
    case "security_door":
      return <LockKeyhole size={18} aria-hidden="true" />;
    case "video_intercom":
      return <MonitorSmartphone size={18} aria-hidden="true" />;
    case "smart_home":
      return <Wifi size={18} aria-hidden="true" />;
    case "central_vacuum":
      return <Wind size={18} aria-hidden="true" />;
    case "water_purifier":
      return <Droplets size={18} aria-hidden="true" />;
    case "water_tank":
      return <Droplets size={18} aria-hidden="true" />;
    case "pressure_pump":
      return <Gauge size={18} aria-hidden="true" />;
    case "generator":
      return <Zap size={18} aria-hidden="true" />;
    case "solar":
      return <Sun size={18} aria-hidden="true" />;
    case "fire_alarm":
      return <Flame size={18} aria-hidden="true" />;
    case "security_system":
      return <ShieldCheck size={18} aria-hidden="true" />;
    case "cctv":
      return <Camera size={18} aria-hidden="true" />;
    case "doorman":
      return <KeyRound size={18} aria-hidden="true" />;
    case "lobby":
      return <Building2 size={18} aria-hidden="true" />;
    case "gym":
      return <Dumbbell size={18} aria-hidden="true" />;
    case "pool":
      return <Waves size={18} aria-hidden="true" />;
    case "sauna":
      return <Flame size={18} aria-hidden="true" />;
    case "jacuzzi":
      return <Bath size={18} aria-hidden="true" />;
    case "sport_ground":
      return <Dumbbell size={18} aria-hidden="true" />;
    case "children_playground":
      return <Baby size={18} aria-hidden="true" />;
    case "coworking":
      return <BriefcaseBusiness size={18} aria-hidden="true" />;
    case "meeting_room":
      return <BriefcaseBusiness size={18} aria-hidden="true" />;
    case "commercial_permission":
      return <BriefcaseBusiness size={18} aria-hidden="true" />;
    case "separate_entrance":
      return <DoorOpen size={18} aria-hidden="true" />;
    case "reception":
      return <Sofa size={18} aria-hidden="true" />;
    case "open_kitchen":
      return <Utensils size={18} aria-hidden="true" />;
    case "island_kitchen":
      return <Utensils size={18} aria-hidden="true" />;
    case "dirty_kitchen":
      return <Utensils size={18} aria-hidden="true" />;
    case "roof_storage":
      return <Warehouse size={18} aria-hidden="true" />;
    case "private_park":
      return <CarFront size={18} aria-hidden="true" />;
    case "guest_park":
      return <CarFront size={18} aria-hidden="true" />;
    case "mechanized_park":
      return <CarFront size={18} aria-hidden="true" />;
    case "ev_charger":
      return <Zap size={18} aria-hidden="true" />;
    case "pet_friendly":
      return <PawPrint size={18} aria-hidden="true" />;
    case "wheelchair_access":
      return <Accessibility size={18} aria-hidden="true" />;
    case "elevator_private":
      return <Navigation size={18} aria-hidden="true" />;
    default:
      return <Sparkles size={18} aria-hidden="true" />;
  }
}

function cleanNullableText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized && !/^(null|undefined)$/i.test(normalized) ? normalized : "";
}

/** One labelled specification row, grouped by what it describes. */
type SpecFact = {
  id: string;
  label: string;
  value: string;
  icon: ReactNode;
};

/**
 * Narrows the `cond && {...}` / `cond ? {...} : null` entries of a spec list.
 * Every group is authored as a list of conditional entries, and this guard is
 * what proves to the type checker that only real rows survive.
 */
function isSpecFact(entry: SpecFact | false | null): entry is SpecFact {
  return Boolean(entry);
}

/**
 * Builds one spec group. The parameter type is what lets TypeScript contextually
 * type the `cond && {...}` entries, so `filter` can narrow them to `SpecFact`.
 */
function specGroup(
  entries: (SpecFact | false | null)[],
): SpecFact[] {
  return entries.filter(isSpecFact);
}

function money(value: string | null) {
  const normalized = cleanNullableText(value);
  if (!normalized) return "";
  const parsed = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(parsed) ? formatToman(parsed) : normalized;
}
function unitPrice(value: string | null, areaM2: number | null) {
  if (!value || !areaM2 || areaM2 <= 0) return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return formatToman(Math.round(parsed / areaM2));
}

/** Guarded unit price: empty string when it cannot be computed truthfully. */
function perMeterLabel(property: Property) {
  if (property.transactionType !== "buy" && property.transactionType !== "sell") return "";
  const value = unitPrice(property.price, property.areaM2);
  return value ? value + " تومان" : "";
}

/**
 * Structured price rows: buy/sell shows the total, rent splits deposit and
 * rent, mortgage shows the deposit. Missing amounts never render a fake
 * number — the row falls back to "تماس بگیرید" only when nothing is stored.
 */
function priceRows(property: Property) {
  const rows: { label: string; value: string }[] = [];
  const deposit = money(property.deposit);
  const rent = money(property.rent);
  const price = money(property.price);

  if (property.transactionType === "rent") {
    if (deposit) rows.push({ label: "رهن", value: deposit + " تومان" });
    if (rent) rows.push({ label: "اجاره", value: rent + " تومان" });
    if (!rows.length) rows.push({ label: "قیمت", value: "تماس بگیرید" });
    return rows;
  }
  if (property.transactionType === "mortgage") {
    rows.push({ label: "رهن", value: deposit ? deposit + " تومان" : "تماس بگیرید" });
    return rows;
  }
  rows.push({ label: "قیمت کل", value: price ? price + " تومان" : "تماس بگیرید" });
  return rows;
}

/** Short, stable, human-friendly file code derived from the immutable id. */
function fileCode(id: string) {
  return id.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase();
}

function mapsLink(latitude: number | null, longitude: number | null, neighborhood: string) {
  if (latitude != null && longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`اصفهان ${neighborhood}`)}`;
}
function openDirectionsFromHere(latitude: number | null, longitude: number | null, neighborhood: string) {
  if (typeof window === "undefined") return;
  const popup = window.open("about:blank", "_blank", "noopener,noreferrer");
  const destination = latitude != null && longitude != null
    ? `${latitude},${longitude}`
    : `اصفهان ${neighborhood}`;

  if (!navigator.geolocation) {
    const href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    if (popup) popup.location.href = href;
    else window.location.href = href;
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const origin = `${position.coords.latitude},${position.coords.longitude}`;
      const href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
      if (popup) popup.location.href = href;
      else window.location.href = href;
    },
    () => {
      const href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
      if (popup) popup.location.href = href;
      else window.location.href = href;
      toast.info("دسترسی به موقعیت فعلی داده نشد؛ مسیر تا محدوده فایل باز شد.");
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 },
  );
}

function osmEmbedUrl(latitude: number, longitude: number) {
  const delta = 0.012;
  const bbox = [
    longitude - delta,
    latitude - delta,
    longitude + delta,
    latitude + delta,
  ].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${latitude}%2C${longitude}`;
}

function normalizePhoneDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\D/g, "");
}

function whatsappLink(phone: string, title: string) {
  const digits = normalizePhoneDigits(phone);
  const intl = digits.startsWith("0098")
    ? digits.slice(2)
    : digits.startsWith("98")
      ? digits
      : digits.startsWith("0")
        ? "98" + digits.slice(1)
        : digits;
  const text = encodeURIComponent(`سلام، درباره فایل «${title}» از سایت هیرمند پیام می‌دهم.`);
  return `https://wa.me/${intl}?text=${text}`;
}
function similarRequestHref(property: Property) {
  const params = new URLSearchParams({
    transaction: property.transactionType,
    type: property.propertyType,
    neighborhood: property.neighborhood,
  });
  return `/?${params.toString()}#inquiry`;
}

function propertyReportWhatsappHref(property: Property, type: string, note: string) {
  const code = fileCode(property.id);
  const message = [
    "سلام، می‌خواهم یک مورد درباره فایل هیرمند گزارش کنم.",
    `کد فایل: ${code}`,
    `عنوان فایل: ${property.title}`,
    `نوع گزارش: ${type}`,
    note.trim() ? `توضیح: ${note.trim()}` : "",
    "لطفاً اطلاعات فایل بررسی شود.",
  ].filter(Boolean).join("\n");
  return `${SITE.whatsappDirect}?text=${encodeURIComponent(message)}`;
}


async function shareCurrentProperty(property: Pick<Property, "id" | "slug" | "title">) {
  if (typeof window === "undefined") return;
  const url = new URL(propertyPath(property), window.location.origin).toString();
  const data = {
    title: property.title,
    text: `فایل «${property.title}» در هیرمند`,
    url,
  };

  try {
    if (navigator.share) {
      await navigator.share(data);
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      toast.success("لینک فایل کپی شد.");
    } else {
      toast.info(url);
      return;
    }
    trackAnalyticsEvent("property_share", property.slug);
  } catch {
    // Native sharing may be cancelled by the visitor.
  }
}

function formatAdDate(value: string | null | undefined) {
  if (!value) return "";
  return formatPersianDate(value);
}

function formatVideoTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "۰:۰۰";
  const total = Math.floor(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes.toLocaleString("fa-IR")}:${seconds.toLocaleString("fa-IR", {
    minimumIntegerDigits: 2,
    useGrouping: false,
  })}`;
}

function VideoPlayer({
  src,
  title,
  autoPlay = false,
  className = "",
}: {
  src: string;
  title: string;
  autoPlay?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sync = () => {
      setCurrentTime(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setPlaying(!video.paused && !video.ended);
      setMuted(video.muted);
    };

    video.addEventListener("loadedmetadata", sync);
    video.addEventListener("durationchange", sync);
    video.addEventListener("timeupdate", sync);
    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    video.addEventListener("ended", sync);
    video.addEventListener("volumechange", sync);

    sync();
    return () => {
      video.removeEventListener("loadedmetadata", sync);
      video.removeEventListener("durationchange", sync);
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("play", sync);
      video.removeEventListener("pause", sync);
      video.removeEventListener("ended", sync);
      video.removeEventListener("volumechange", sync);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !autoPlay) return;
    void video.play().catch(() => setPlaying(false));
  }, [autoPlay, src]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      void video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }

  function seekBy(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    const max = Number.isFinite(video.duration) ? video.duration : duration;
    video.currentTime = Math.min(Math.max((video.currentTime || 0) + seconds, 0), max || Number.MAX_SAFE_INTEGER);
  }

  function seekTo(next: number) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(next)) return;
    video.currentTime = Math.min(Math.max(next, 0), duration || 0);
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }

  return (
    <div
      className={`property-video-player ${className} ${playing ? "is-playing" : "is-paused"}`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="property-video-frame">
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload="metadata"
          autoPlay={autoPlay}
          aria-label={title}
          onDoubleClick={togglePlay}
        />
        <button
          type="button"
          className="property-video-center-play"
          onClick={togglePlay}
          aria-label={playing ? "توقف ویدیو" : "پخش ویدیو"}
          title={playing ? "توقف ویدیو" : "پخش ویدیو"}
        >
          {playing ? <Pause size={26} aria-hidden="true" /> : <Play size={26} fill="currentColor" aria-hidden="true" />}
        </button>
      </div>

      <div
        className="property-video-controls"
        dir="ltr"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
        onTouchEnd={(event) => event.stopPropagation()}
      >
        <button type="button" onClick={togglePlay} aria-label={playing ? "توقف ویدیو" : "پخش ویدیو"} title={playing ? "توقف" : "پخش"}>
          {playing ? <Pause size={17} aria-hidden="true" /> : <Play size={17} fill="currentColor" aria-hidden="true" />}
        </button>
        <button type="button" onClick={() => seekBy(-10)} aria-label="۱۰ ثانیه عقب" title="۱۰ ثانیه عقب">
          <Rewind size={17} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => seekBy(10)} aria-label="۱۰ ثانیه جلو" title="۱۰ ثانیه جلو">
          <FastForward size={17} aria-hidden="true" />
        </button>
        <span className="property-video-time" aria-label="زمان ویدیو">
          {formatVideoTime(currentTime)} / {formatVideoTime(duration)}
        </span>
        <input
          className="property-video-progress"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => seekTo(Number(event.currentTarget.value))}
          aria-label="نوار زمان ویدیو"
          style={{ "--video-progress": duration ? `${(currentTime / duration) * 100}%` : "0%" } as Record<string, string>}
        />
        <button type="button" onClick={toggleMute} aria-label={muted ? "فعال کردن صدا" : "بی‌صدا کردن"} title={muted ? "فعال کردن صدا" : "بی‌صدا کردن"}>
          {muted ? <VolumeX size={17} aria-hidden="true" /> : <Volume2 size={17} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

function ResilientImage({
  src,
  alt,
  fallback,
  fallbackLegacy,
  className,
  loading,
  itemProp,
  fetchPriority,
}: {
  src: string;
  alt: string;
  fallback: string;
  fallbackLegacy?: string;
  className?: string;
  loading?: "eager" | "lazy";
  itemProp?: string;
  fetchPriority?: "high" | "low" | "auto";
}) {
  const candidates = mediaSourceCandidates(src, fallback);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [legacyMode, setLegacyMode] = useState(false);
  const current = candidates[Math.min(attempt, Math.max(0, candidates.length - 1))] ?? fallback;
  const sourceLegacyFallback = current.startsWith("/images/fallback/")
    ? current.replace(/\.(?:jpe?g|webp|avif)$/i, ".svg")
    : "";
  // Prefer the known, checked-in emergency asset supplied by the caller.
  // Deriving ".svg" from a raster filename is unsafe: only legacy slots 01/02
  // exist for each property type, while generated raster slots extend further.
  const fallbackLegacyImage =
    fallbackLegacy ||
    sourceLegacyFallback ||
    (fallback.startsWith("/images/fallback/")
      ? fallback.replace(/\.(?:jpe?g|webp|avif)$/i, ".svg")
      : "");

  if (failed) {
    if (fallbackLegacyImage) {
      return (
        <img
          src={fallbackLegacyImage}
          alt={alt}
          className={className}
          loading={loading}
          fetchPriority={fetchPriority}
          itemProp={itemProp}
          referrerPolicy="no-referrer"
          decoding="async"
        />
      );
    }
    return (
      <span className="property-image-fallback" role="img" aria-label={alt}>
        <span>تصویر در دسترس نیست</span>
      </span>
    );
  }

  const usingLocalFallback = current === fallback && fallback.startsWith("/images/fallback/");
  const usingLocalRasterFallback =
    usingLocalFallback && /\.(avif|webp)$/i.test(fallback);
  const fallbackAvif =
    usingLocalRasterFallback && /\.webp$/i.test(fallback)
      ? fallback.replace(/\.webp$/i, ".avif")
      : "";
  return (
    <picture>
      {usingLocalRasterFallback && !legacyMode && fallbackAvif ? (
        <source srcSet={fallbackAvif} type="image/avif" />
      ) : null}
      {usingLocalRasterFallback && !legacyMode ? (
        <source srcSet={fallback} type="image/webp" />
      ) : null}
      <img
        src={usingLocalFallback && legacyMode && fallbackLegacyImage ? fallbackLegacyImage : current}
        alt={alt}
        className={className}
        loading={loading}
        fetchPriority={fetchPriority}
        itemProp={itemProp}
        referrerPolicy="no-referrer"
        decoding="async"
        onError={() => {
          if (usingLocalFallback && !legacyMode && fallbackLegacyImage) {
            setLegacyMode(true);
            return;
          }
          if (attempt < candidates.length - 1) {
            setAttempt((value) => Math.min(value + 1, candidates.length - 1));
          } else {
            setFailed(true);
          }
        }}
      />
    </picture>
  );
}

function Gallery({
  images,
  title,
  featured,
  fallback,
  fallbackLegacy,
}: {
  images: readonly string[];
  title: string;
  featured: boolean;
  fallback: string;
  fallbackLegacy?: string;
}) {
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const touchStartX = useRef<number | null>(null);
  const pinchStartDistance = useRef<number | null>(null);
  const pinchStartScale = useRef(1);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const lightboxRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const activeRef = useRef(0);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const current = images[active] ?? images[0] ?? "";

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const goTo = useCallback(
    (next: number) => {
      if (!images.length) return;
      setActive((next + images.length) % images.length);
      setZoomScale(1);
    },
    [images.length],
  );

  useEffect(() => {
    setActive((value) => Math.min(value, Math.max(0, images.length - 1)));
  }, [images.length]);

  useEffect(() => {
    thumbRefs.current[active]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [active]);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
    setZoomScale(1);
    touchStartX.current = null;
    pinchStartDistance.current = null;
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;

    const previousOverflow = document.body.style.overflow;
    lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowLeft") goTo(activeRef.current - 1);
      if (event.key === "ArrowRight") goTo(activeRef.current + 1);
      if (event.key === "0") setZoomScale(1);
      if (event.key === "Tab") {
        const focusable = Array.from(
          lightboxRef.current?.querySelectorAll("button:not([disabled]), a[href], video[controls]") ?? [],
        ).filter(
          (element): element is HTMLElement =>
            element instanceof HTMLElement && element.offsetParent !== null,
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      lastFocusedRef.current?.focus({ preventScroll: true });
      lastFocusedRef.current = null;
    };
  }, [lightboxOpen, goTo, closeLightbox]);

  useEffect(() => {
    if (!images.length) return;

    const indexes = [
      (active + 1) % images.length,
      (active - 1 + images.length) % images.length,
    ];

    indexes.forEach((index) => {
      const src = images[index];
      if (!src || isVideoUrl(src)) return;
      const candidate = mediaSourceCandidates(src, fallback)[0];
      if (!candidate) return;
      const image = new Image();
      image.decoding = "async";
      image.src = candidate;
    });
  }, [active, images, fallback]);

  function touchDistance(touches: TouchEvent<HTMLDivElement>["touches"]) {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length >= 2) {
      pinchStartDistance.current = touchDistance(event.touches);
      pinchStartScale.current = zoomScale;
      touchStartX.current = null;
      return;
    }
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length < 2 || pinchStartDistance.current == null) return;
    event.preventDefault();
    const distance = touchDistance(event.touches);
    if (!distance) return;
    const nextScale = pinchStartScale.current * (distance / pinchStartDistance.current);
    setZoomScale(Math.min(3, Math.max(1, nextScale)));
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (pinchStartDistance.current != null) {
      pinchStartDistance.current = null;
      if (zoomScale < 1.05) setZoomScale(1);
      return;
    }

    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX == null || zoomScale > 1.05 || images.length < 2) return;

    const endX = event.changedTouches[0]?.clientX ?? startX;
    const delta = endX - startX;
    if (Math.abs(delta) < 55) return;
    goTo(delta > 0 ? active - 1 : active + 1);
  }

  function toggleZoom() {
    setZoomScale((value) => (value > 1.05 ? 1 : 2.25));
  }

  return (
    <div className="property-gallery-wrap" role="region" aria-label={"گالری تصاویر " + title}>
      <div className="property-gallery">
        <div className="property-gallery-main">
          {!isVideoUrl(current) || !isPermanentlyWatermarkedMediaUrl(current) ? (
            <PropertyMediaWatermark subtle={isPropertyFallbackImage(current) || current.startsWith("/images/fallback/")} />
          ) : null}
          {isVideoUrl(current) ? (
            <VideoPlayer src={current} title={title} className="is-gallery" />
          ) : (
            <ResilientImage
              src={current}
              fallback={fallback}
              fallbackLegacy={fallbackLegacy}
              alt={title + " - تصویر " + (active + 1).toLocaleString("fa-IR")}
              itemProp="image"
              loading="eager"
              fetchPriority="high"
            />
          )}

          <button
            type="button"
            className="property-gallery-open"
            onClick={() => {
              setZoomScale(1);
              setLightboxOpen(true);
            }}
            aria-label="باز کردن گالری تصاویر در اندازه بزرگ"
          >
            <span>
              <Maximize2 size={16} aria-hidden="true" />
              تمام‌صفحه
            </span>
          </button>

          <div className="property-gallery-overlays">
            {isPropertyFallbackImage(current) || current.startsWith("/images/fallback/") ? (
              <span className="property-gallery-sample-label">تصویر نمونه</span>
            ) : null}
            {featured ? <span className="property-gallery-featured">فایل ویژه</span> : null}
            {images.length > 1 ? (
              <span className="property-gallery-counter" aria-live="polite">
                تصویر {(active + 1).toLocaleString("fa-IR")} از {images.length.toLocaleString("fa-IR")}
              </span>
            ) : null}
          </div>

          {images.length > 1 ? (
            <>
              <button
                type="button"
                className="property-gallery-nav property-gallery-prev"
                onClick={() => goTo(active - 1)}
                aria-label="تصویر قبلی"
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="property-gallery-nav property-gallery-next"
                onClick={() => goTo(active + 1)}
                aria-label="تصویر بعدی"
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>

        <div className="property-gallery-rail" aria-label="انتخاب تصویر">
          {images.map((src, index) => (
            <button
              ref={(element) => {
                thumbRefs.current[index] = element;
              }}
              key={src + "-" + index}
              type="button"
              className={"property-gallery-thumb" + (index === active ? " is-active" : "")}
              onClick={() => goTo(index)}
              aria-label={"نمایش تصویر " + (index + 1).toLocaleString("fa-IR") + " از " + images.length.toLocaleString("fa-IR")}
              aria-current={index === active ? "true" : undefined}
            >
              {isVideoUrl(src) ? (
                <video src={src} muted playsInline preload="none" aria-hidden="true" />
              ) : (
                <ResilientImage src={src} fallback={fallback} fallbackLegacy={fallbackLegacy} alt="" loading="lazy" />
              )}
              <span className="property-gallery-thumb-number">
                {(index + 1).toLocaleString("fa-IR")}
              </span>
            </button>
          ))}
        </div>
      </div>

      {lightboxOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={lightboxRef}
              className="property-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={"نمایش تصاویر " + title}
              tabIndex={-1}
              onClick={closeLightbox}
            >
              <button
                ref={closeButtonRef}
                type="button"
                className="property-lightbox-close"
                onClick={closeLightbox}
                aria-label="بستن نمایش تصاویر"
                title="بستن نمایش تصاویر (Esc)"
              >
                <X size={21} strokeWidth={2.4} aria-hidden="true" />
              </button>

              <button
                type="button"
                className="property-lightbox-nav property-lightbox-prev"
                onClick={(event) => {
                  event.stopPropagation();
                  goTo(active - 1);
                }}
                aria-label="تصویر قبلی"
              >
                <ChevronRight size={26} aria-hidden="true" />
              </button>

              <div
                className="property-lightbox-stage"
                onClick={(event) => event.stopPropagation()}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {!isVideoUrl(current) || !isPermanentlyWatermarkedVideoUrl(current) ? <PropertyMediaWatermark /> : null}
                {isVideoUrl(current) ? (
                  <VideoPlayer src={current} title={title} autoPlay className="is-lightbox" />
                ) : (
                  <button
                    type="button"
                    className={"property-lightbox-media-button" + (zoomScale > 1.05 ? " is-zoomed" : "")}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      toggleZoom();
                    }}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={zoomScale > 1.05 ? "بازگرداندن اندازه تصویر" : "بزرگ‌نمایی تصویر"}
                  >
                    <ResilientImage
                      src={current}
                      fallback={fallback}
                      fallbackLegacy={fallbackLegacy}
                      alt={title + " - تصویر " + (active + 1).toLocaleString("fa-IR")}
                      loading="eager"
                    />
                  </button>
                )}
                <div className="property-lightbox-count" aria-live="polite">
                  تصویر {(active + 1).toLocaleString("fa-IR")} از {images.length.toLocaleString("fa-IR")}
                </div>
                {!isVideoUrl(current) ? (
                  <button
                    type="button"
                    className="property-lightbox-zoom-hint"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleZoom();
                    }}
                    aria-label={zoomScale > 1.05 ? "خروج از بزرگ‌نمایی" : "بزرگ‌نمایی تصویر"}
                  >
                    {zoomScale > 1.05 ? "بازگشت به اندازه عادی" : "دو بار کلیک / لمس برای زوم"}
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                className="property-lightbox-nav property-lightbox-next"
                onClick={(event) => {
                  event.stopPropagation();
                  goTo(active + 1);
                }}
                aria-label="تصویر بعدی"
              >
                <ChevronLeft size={26} aria-hidden="true" />
              </button>

              <div className="property-lightbox-strip" onClick={(event) => event.stopPropagation()}>
                {images.map((src, index) => (
                  <button
                    key={src + "-" + index}
                    type="button"
                    className={"property-lightbox-thumb" + (index === active ? " is-active" : "")}
                    onClick={() => setActive(index)}
                    aria-label={"تصویر " + (index + 1).toLocaleString("fa-IR")}
                    aria-current={index === active ? "true" : undefined}
                  >
                    {isVideoUrl(src) ? (
                      <video src={src} muted playsInline preload="metadata" aria-hidden="true" />
                    ) : (
                      <ResilientImage src={src} fallback={fallback} fallbackLegacy={fallbackLegacy} alt="" loading="lazy" />
                    )}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function ConsultantCard({ property }: { property: Property }) {
  const consultants = useConsultants();
  const person = consultants.find((item) => item.phone === property.contactPhone || item.name === property.contactName);
  const displayName = property.contactName || person?.name || "مشاور هیرمند";
  const role = person?.role ?? "مشاور املاک";
  const ConsultantIcon = person?.icon === "handshake" ? Handshake : Briefcase;

  return (
    <div className="property-contact-card" aria-label="اطلاعات مشاور فایل">
      <div className="property-consultant-main">
        <div className="property-consultant-avatar" aria-hidden="true">
          <ConsultantIcon size={20} strokeWidth={1.8} />
        </div>
        <div className="property-consultant-copy">
          <span className="kicker">مشاور فایل</span>
          <strong className="property-contact-name">{displayName}</strong>
          <span className="property-consultant-role">{role}</span>
        </div>
        <div className="property-consultant-badge" aria-hidden="true">
          <Phone size={18} />
        </div>
      </div>

      <a href={`tel:${property.contactPhone}`} dir="ltr" className="property-contact-phone">
        <Phone size={16} aria-hidden="true" />
        <span>{property.contactPhone}</span>
      </a>

      <p className="property-contact-note">
        برای هماهنگی بازدید، دریافت اطلاعات تکمیلی و بررسی شرایط معامله با این مشاور در تماس باشید.
      </p>

      <div className="property-contact-actions">
        <a
          href={`tel:${property.contactPhone}`}
          className="btn-gold"
          onClick={() => trackAnalyticsEvent("call_click", property.slug)}
        >
          <Phone size={16} aria-hidden="true" />
          تماس مستقیم
        </a>
      </div>

      {person ? (
        <Link
          className="property-contact-profile"
          to="/consultants/$id"
          params={{ id: person.id }}
        >
          مشاهده پروفایل کامل مشاور
          <ChevronLeft size={15} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

export function PropertyDetailView({
  property,
  related,
}: {
  property: Property | null;
  related: Property[];
}) {
  const viewedPropertySlug = property?.slug;
  const [priceHistory, setPriceHistory] = useState<PropertyPriceHistoryItem[]>([]);
  const [priceWatchEnabled, setPriceWatchEnabled] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState("قیمت یا مشخصات نادرست");
  const [reportNote, setReportNote] = useState("");
  const [reportBusy, setReportBusy] = useState(false);

  // The gallery list is derived before the early return below: a hook that only
  // runs for a present property would break React's hook order the moment the
  // same component renders with and without data.
  const images = useMemo(() => {
    const raw = property?.images ?? [];
    const cleaned = Array.from(new Set(raw.map((src) => src.trim()).filter(Boolean)));
    const ownedImages = cleaned.filter((src) => !isPropertyFallbackImage(src));
    return ownedImages.length
      ? ownedImages
      : getPropertyFallbackImages(property?.propertyType ?? "apartment");
  }, [property?.images, property?.propertyType]);

  useEffect(() => {
    if (!viewedPropertySlug || typeof window === "undefined") {
      setPriceHistory([]);
      setPriceWatchEnabled(false);
      return;
    }

    let cancelled = false;
    void getPublishedPropertyPriceHistory({ data: { slug: viewedPropertySlug } })
      .then((items) => {
        if (!cancelled) setPriceHistory(items);
      })
      .catch(() => {
        if (!cancelled) setPriceHistory([]);
      });

    let ignoreWatchSync = false;
    void fetch("/api/property-watch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "sync" }),
    })
      .then((response) => response.ok
        ? response.json() as Promise<{
            subscriptions?: Array<{ slug: string }>;
            alerts?: Array<{ id: string; message: string }>;
          }>
        : null)
      .then((result) => {
        if (ignoreWatchSync) return;
        setPriceWatchEnabled(Boolean(result?.subscriptions?.some((item) => item.slug === viewedPropertySlug)));
        const alerts = result?.alerts ?? [];
        if (alerts.length) {
          for (const alert of alerts.slice(0, 3)) {
            toast.success(alert.message);
          }
          void fetch("/api/property-watch", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "seen",
              alertIds: alerts.map((alert) => Number(alert.id)).filter(Number.isFinite),
            }),
          }).catch(() => {});
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      ignoreWatchSync = true;
    };
  }, [viewedPropertySlug, property?.price, property?.deposit, property?.rent]);

  async function togglePriceWatch() {
    if (!viewedPropertySlug || typeof window === "undefined") return;
    const nextAction = priceWatchEnabled ? "unsubscribe" : "subscribe";

    try {
      const response = await fetch("/api/property-watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: nextAction, slug: viewedPropertySlug }),
      });
      if (!response.ok) throw new Error("watch request failed");
      setPriceWatchEnabled(nextAction === "subscribe");
      trackAnalyticsEvent("property_price_watch", viewedPropertySlug);
      toast.success(
        nextAction === "subscribe"
          ? "پیگیری قیمت این فایل روی حساب مرورگر شما فعال شد."
          : "پیگیری قیمت این فایل خاموش شد.",
      );
    } catch {
      toast.error("ثبت پیگیری قیمت انجام نشد؛ دوباره تلاش کنید.");
    }
  }

  useEffect(() => {
    if (!viewedPropertySlug || typeof window === "undefined") return;
    const recentKey = "hirmand-recent-properties";
    try {
      const raw = localStorage.getItem(recentKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const recent = Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string" && item !== viewedPropertySlug)
        : [];
      localStorage.setItem(
        recentKey,
        JSON.stringify([viewedPropertySlug, ...recent].slice(0, 8)),
      );
    } catch {
      // History is a convenience feature; ignore storage failures.
    }
    const viewKey = `hirmand-viewed:${viewedPropertySlug}`;
    if (!sessionStorage.getItem(viewKey)) {
      trackAnalyticsEvent("property_view", viewedPropertySlug);
      sessionStorage.setItem(viewKey, "1");
    }
  }, [viewedPropertySlug]);

  if (!property) {
    return (
      <SiteChrome>
        <main className="page-shell">
          <section className="empty-state">
            <h1>فایل پیدا نشد</h1>
            <p>این فایل منتشر نشده یا حذف شده است.</p>
            <Link to="/" className="btn-gold">بازگشت به خانه</Link>
          </section>
        </main>
      </SiteChrome>
    );
  }

  const area = areaSlug(property.neighborhood);
  const featuredActive = isFeaturedActive(property);
  const canRequestViewing =
    property.availabilityStatus === "available" || property.availabilityStatus === "reserved";
  const isClosedFile =
    property.availabilityStatus === "sold" ||
    property.availabilityStatus === "rented" ||
    property.availabilityStatus === "unavailable";
  const perMeter = perMeterLabel(property);
  const code = fileCode(property.id);
  const descriptionParagraphs = property.description
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const crumbs = [
    { name: "خانه", path: "/" },
    ...(area ? [{ name: property.neighborhood, path: `/areas/${area}` }] : []),
    { name: property.title, path: propertyPath(property) },
  ];

  // مشخصات به‌صورت گروه‌بندی‌شده ساخته می‌شود تا صفحه به‌جای یک دیوار طولانی از
  // فیلدها، سه بلوک قابل اسکن داشته باشد. هر مورد فقط وقتی ساخته می‌شود که در
  // داده واقعی وجود داشته باشد، پس هیچ مقدار فرضی وارد رابط کاربری نمی‌شود.
  const has = (value: string | null | undefined): value is string => Boolean(value);
  const yesNo = (value: boolean) => (value ? "دارد" : "ندارد");

  const coreSpecs = specGroup([
    property.areaM2 != null && {
      id: "area",
      label: "متراژ",
      value: property.areaM2.toLocaleString("fa-IR") + " متر",
      icon: <Ruler size={18} aria-hidden="true" />,
    },
    property.bedrooms != null && {
      id: "bedrooms",
      label: "اتاق خواب",
      value: property.bedrooms.toLocaleString("fa-IR"),
      icon: <BedDouble size={18} aria-hidden="true" />,
    },
    property.bathrooms != null && {
      id: "bathrooms",
      label: "سرویس",
      value: property.bathrooms.toLocaleString("fa-IR"),
      icon: <Bath size={18} aria-hidden="true" />,
    },
    property.floorLabel === "suite" && {
      id: "floor",
      label: "طبقه",
      value: "سوئیت",
      icon: <Building2 size={18} aria-hidden="true" />,
    },
    property.floorLabel !== "suite" && property.floor != null && {
      id: "floor",
      label: "طبقه",
      value: property.floor.toLocaleString("fa-IR"),
      icon: <Building2 size={18} aria-hidden="true" />,
    },
    property.totalFloors != null && {
      id: "total-floors",
      label: "تعداد طبقات",
      value: property.totalFloors.toLocaleString("fa-IR"),
      icon: <Layers3 size={18} aria-hidden="true" />,
    },
    property.builtYear != null && {
      id: "built-year",
      label: "سال ساخت",
      value: property.builtYear.toLocaleString("fa-IR", { useGrouping: false }),
      icon: <CalendarDays size={18} aria-hidden="true" />,
    },
    property.orientation && {
      id: "orientation",
      label: "موقعیت ملک",
      value: PROPERTY_ORIENTATION_LABELS[property.orientation],
      icon: <Navigation size={18} aria-hidden="true" />,
    },
  ]);

  const buildingSpecs = specGroup([
    {
      id: "parking",
      label: "پارکینگ",
      value: yesNo(property.parking),
      icon: <CarFront size={18} aria-hidden="true" />,
    },
    {
      id: "elevator",
      label: "آسانسور",
      value: yesNo(property.elevator),
      icon: <Navigation size={18} aria-hidden="true" />,
    },
    {
      id: "storage",
      label: "انباری",
      value: yesNo(property.storage),
      icon: <Warehouse size={18} aria-hidden="true" />,
    },
    property.coolingSystem && {
      id: "cooling",
      label: "سیستم سرمایش",
      value: labelForOption(PROPERTY_COOLING_OPTIONS, property.coolingSystem),
      icon: propertyAmenityIcon("cooling"),
    },
    property.heatingSystem && {
      id: "heating",
      label: "سیستم گرمایش",
      value: labelForOption(PROPERTY_HEATING_OPTIONS, property.heatingSystem),
      icon: propertyAmenityIcon("heating"),
    },
  ]);

  const extraSpecs = specGroup([
    {
      id: "painted",
      label: "رنگ‌آمیزی",
      value: yesNo(property.painted),
      icon: <Paintbrush size={18} aria-hidden="true" />,
    },
    {
      id: "wallpaper",
      label: "کاغذ دیواری",
      value: yesNo(property.wallpaper),
      icon: <Wallpaper size={18} aria-hidden="true" />,
    },
    has(property.cabinetType) && {
      id: "cabinet",
      label: "نوع کابینت",
      value: labelForOption(PROPERTY_CABINET_OPTIONS, property.cabinetType),
      icon: <Building2 size={18} aria-hidden="true" />,
    },
    has(property.flooringType) && {
      id: "flooring",
      label: "کف",
      value: labelForOption(PROPERTY_FLOORING_OPTIONS, property.flooringType),
      icon: <Layers3 size={18} aria-hidden="true" />,
    },
    has(property.wallClosetType) && {
      id: "closet",
      label: "کمد دیواری",
      value: labelForOption(PROPERTY_WALL_CLOSET_OPTIONS, property.wallClosetType),
      icon: <Building2 size={18} aria-hidden="true" />,
    },
  ]);

  const amenityCount =
    property.otherAmenities.length +
    (property.coolingSystem ? 1 : 0) +
    (property.heatingSystem ? 1 : 0);

  const specGroups: { id: string; title: string; facts: SpecFact[] }[] = [
    { id: "core", title: "مشخصات اصلی", facts: coreSpecs },
    { id: "building", title: "امکانات ساختمان", facts: buildingSpecs },
    { id: "extra", title: "امکانات تکمیلی", facts: extraSpecs },
  ];

  const descriptionSummary =
    descriptionParagraphs.find((paragraph) => paragraph.trim())?.trim() ??
    "برای دریافت جزئیات کامل، شرایط معامله و هماهنگی بازدید با مشاور فایل در تماس باشید.";

  return (
    <SiteChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(propertyJsonLd(property)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(crumbs)) }}
      />

      <main className="property-detail-page">
        <nav className="property-breadcrumb" aria-label="مسیر">
          <Link to="/">خانه</Link>
          <span>/</span>
          {area ? (
            <>
              <Link to="/areas/$slug" params={{ slug: area }}>{property.neighborhood}</Link>
              <span>/</span>
            </>
          ) : null}
          <span>{property.title}</span>
        </nav>

        <section className="property-detail-top" aria-label="خلاصه فایل">
          <div className="property-detail-top-gallery">
            <Gallery
              key={property.id}
              images={images}
              title={property.title}
              featured={featuredActive}
              fallback={getPropertyFallbackImage(property.propertyType, property.id)}
              fallbackLegacy={getPropertyFallbackLegacyImage(property.propertyType, property.id)}
            />
          </div>


            <div className="property-detail-summary">
              <header className="property-detail-summary-head">
                <div className="property-detail-hero-row">
                  <div className="property-status-group">
                    <span className="property-status-badge">
                      {TX_LABEL[property.transactionType]}
                    </span>
                    <span className="property-type-badge">
                      {TYPE_LABEL[property.propertyType]}
                    </span>
                    <span
                      className={"property-availability-badge property-availability-badge-" + property.availabilityStatus}
                    >
                      {PROPERTY_AVAILABILITY_LABELS[property.availabilityStatus]}
                    </span>
                    {featuredActive ? <span className="property-featured-note">فایل ویژه</span> : null}
                  </div>
                  {code ? (
                    <span className="property-file-code">
                      کد فایل <bdi dir="ltr">{code}</bdi>
                    </span>
                  ) : null}
                </div>

                <div className="property-detail-title-block">
                  <span className="property-detail-eyebrow">معرفی فایل هیرمند</span>
                  <h1>{property.title}</h1>
                  <p className="property-detail-meta">
                    <MapPinned size={17} aria-hidden="true" />
                    <span>
                      اصفهان · {property.neighborhood} · موقعیت تقریبی
                    </span>
                  </p>
                </div>

                <div className="property-price-block">
                  <span className="property-price-label">قیمت فایل</span>
                  <div className="property-price-rows">
                    {priceRows(property).map((row) => (
                      <div className="property-price-row" key={row.label}>
                        <span className="property-price-row-label">{row.label}</span>
                        <strong dir="rtl" className="property-price-value">{row.value}</strong>
                      </div>
                    ))}
                  </div>
                  {perMeter ? (
                    <small className="property-price-per-m2">
                      قیمت تقریبی هر متر: <strong>{perMeter}</strong>
                    </small>
                  ) : null}
                  {property.updatedAt ? (
                    <small className="property-price-updated">
                      بروزرسانی قیمت و فایل: <time dateTime={property.updatedAt}>{formatAdDate(property.updatedAt)}</time>
                    </small>
                  ) : null}
                </div>

                <div className="property-primary-contact" aria-label="تماس سریع با مشاور">
                  <PropertyCallbackRequest propertyType={TYPE_LABEL[property.propertyType]} neighborhood={property.neighborhood} context={"فایل «" + property.title + "»"} />
                  <a
                    className="property-primary-contact-call"
                    href={`tel:${property.contactPhone}`}
                    onClick={() => trackAnalyticsEvent("call_click", property.slug)}
                  >
                    <Phone size={18} aria-hidden="true" />
                    <span>تماس سریع</span>
                  </a>
                  <a
                    className="property-primary-contact-whatsapp"
                    href={whatsappLink(property.contactPhone, property.title)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackAnalyticsEvent("whatsapp_click", property.slug)}
                  >
                    <WhatsAppIcon size={18} aria-hidden="true" />
                    <span>واتساپ</span>
                  </a>
                </div>

                <details className="property-summary-utilities">
                  <summary className="property-summary-utilities-summary">
                    <span>
                      <strong>اقدامات بیشتر</strong>
                      <small>ذخیره، اشتراک، مقایسه، چاپ و ابزارهای فایل</small>
                    </span>
                    <ChevronDown size={17} aria-hidden="true" />
                  </summary>

                  <div className="property-summary-utilities-content">
                    <div className="property-detail-tools-row">
                      <PropertyActions property={property} />
                      <a
                        href={similarRequestHref(property)}
                        className="property-similar-request-btn"
                        onClick={() => trackAnalyticsEvent("inquiry_click", property.slug)}
                      >
                        <Sparkles size={16} aria-hidden="true" />
                        درخواست فایل مشابه
                      </a>
                      <button
                        type="button"
                        className="property-report-btn"
                        onClick={() => {
                          setReportOpen(true);
                          setReportNote("");
                          trackAnalyticsEvent("property_report", property.slug);
                        }}
                      >
                        <Flag size={16} aria-hidden="true" />
                        گزارش ایراد فایل
                      </button>
                    </div>

                    {reportOpen ? (
                      <div className="property-report-backdrop" role="presentation" onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setReportOpen(false);
                      }}>
                        <section className="property-report-dialog" role="dialog" aria-modal="true" aria-labelledby="property-report-title">
                          <button type="button" className="property-report-close" onClick={() => setReportOpen(false)} aria-label="بستن">
                            <X size={18} />
                          </button>
                          <span className="kicker">بازخورد فایل</span>
                          <h2 id="property-report-title">اشکال این فایل را به هیرمند اطلاع دهید.</h2>
                          <p>گزارش شما فقط برای بررسی اطلاعات همین فایل آماده می‌شود.</p>
                          <div className="property-report-types">
                            {[
                              "قیمت یا مشخصات نادرست",
                              "وضعیت فایل تغییر کرده",
                              "تصویر یا توضیحات نامرتبط",
                              "مشکل در موقعیت یا محله",
                              "سایر",
                            ].map((type) => (
                              <button
                                key={type}
                                type="button"
                                className={reportType === type ? "is-selected" : ""}
                                onClick={() => setReportType(type)}
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                          <label className="property-report-note field">
                            <span>توضیح کوتاه (اختیاری)</span>
                            <textarea
                              rows={3}
                              value={reportNote}
                              onChange={(event) => setReportNote(event.target.value)}
                              placeholder="مثلاً قیمت فایل تغییر کرده یا ملک اجاره رفته است..."
                              maxLength={500}
                            />
                          </label>
                          <div className="property-report-actions">
                            <button type="button" className="btn-ghost" onClick={() => setReportOpen(false)} disabled={reportBusy}>انصراف</button>
                            <button
                              type="button"
                              className="btn-gold"
                              disabled={reportBusy}
                              onClick={async () => {
                                if (reportBusy) return;
                                setReportBusy(true);
                                try {
                                  const response = await fetch("/api/property-reports", {
                                    method: "POST",
                                    headers: { "content-type": "application/json" },
                                    body: JSON.stringify({
                                      propertyId: property.id,
                                      propertySlug: property.slug,
                                      propertyTitle: property.title,
                                      reportType,
                                      note: reportNote,
                                    }),
                                  });
                                  const payload = await response.json().catch(() => null);
                                  if (!response.ok || !payload?.ok) {
                                    throw new Error(payload?.statusMessage || payload?.message || "ثبت گزارش انجام نشد.");
                                  }
                                  trackAnalyticsEvent("property_report", property.slug);
                                  setReportOpen(false);
                                  setReportNote("");
                                  toast.success("گزارش شما ثبت شد و برای بررسی تیم هیرمند ارسال شد.");
                                } catch (error) {
                                  toast.error(error instanceof Error ? error.message : "ثبت گزارش انجام نشد؛ دوباره تلاش کنید.");
                                } finally {
                                  setReportBusy(false);
                                }
                              }}
                            >
                              {reportBusy ? "در حال ثبت…" : "ثبت گزارش برای هیرمند"}
                            </button>
                            <a
                              className="btn-ghost"
                              href={propertyReportWhatsappHref(property, reportType, reportNote)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <WhatsAppIcon size={17} aria-hidden="true" />
                              واتساپ هم ارسال کن
                            </a>
                          </div>
                        </section>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      className={"property-price-watch-button" + (priceWatchEnabled ? " is-active" : "")}
                      onClick={togglePriceWatch}
                      aria-pressed={priceWatchEnabled}
                    >
                      <Bell size={16} aria-hidden="true" />
                      <span>{priceWatchEnabled ? "در حال پیگیری قیمت" : "پیگیری تغییر قیمت"}</span>
                    </button>
                  </div>
                </details>

                <div className="property-trust-strip" aria-label="اطمینان از اطلاعات فایل">
                  <span><Check size={14} aria-hidden="true" /> اطلاعات ثبت‌شده هیرمند</span>
                  <span><MapPinned size={14} aria-hidden="true" /> موقعیت تقریبی</span>
                  <span><Briefcase size={14} aria-hidden="true" /> مشاور مشخص</span>
                </div>

                                <div className="property-summary-facts" aria-label="اطلاعات کلیدی فایل">
                  {property.areaM2 != null ? (
                    <div><Ruler size={16} aria-hidden="true" /><span><small>متراژ</small><strong>{property.areaM2.toLocaleString("fa-IR")} متر</strong></span></div>
                  ) : null}
                  {property.bedrooms != null ? (
                    <div><BedDouble size={16} aria-hidden="true" /><span><small>خواب</small><strong>{property.bedrooms.toLocaleString("fa-IR")}</strong></span></div>
                  ) : null}
                  {property.builtYear != null ? (
                    <div><CalendarDays size={16} aria-hidden="true" /><span><small>سال ساخت</small><strong>{property.builtYear.toLocaleString("fa-IR", { useGrouping: false })}</strong></span></div>
                  ) : null}
                  <div><CarFront size={16} aria-hidden="true" /><span><small>پارکینگ</small><strong>{property.parking ? "دارد" : "ندارد"}</strong></span></div>
                </div>
              </header>
            </div>
        </section>

        <nav className="property-detail-section-nav" aria-label="بخش‌های اصلی فایل">
          <span className="property-detail-section-nav-label">بخش‌های اصلی</span>
          <a href="#property-description-section">معرفی</a>
          <a href="#property-specs-section">مشخصات</a>
          <a href="#property-location-section">موقعیت</a>
          <a href="#property-floor-plan">پلان</a>
          <a href="#property-tools-section">ابزارها</a>
        </nav>

        <section className="property-detail-content">
          <article className="property-detail-main">
            <section id="property-specs-section" className="property-divar-specs" aria-labelledby="property-specs-title">
              <details className="property-specs-accordion" open>
                <summary className="property-specs-accordion-summary">
                  <span className="property-specs-accordion-heading">
                    <span className="kicker">جزئیات فایل</span>
                    <h2 id="property-specs-title" className="property-specs-title">مشخصات ملک</h2>
                  </span>
                  <span className="property-specs-accordion-meta">
                    <span className="property-source-badge">اطلاعات آگهی</span>
                    <ChevronDown size={18} aria-hidden="true" />
                  </span>
                </summary>
                <div className="property-specs-accordion-body">
              {specGroups
                .filter((group) => group.facts.length > 0)
                .map((group) => (
                  <section
                    className={`property-spec-group property-spec-group-${group.id}`}
                    key={group.id}
                    aria-labelledby={`spec-group-${group.id}`}
                  >
                    <h3 className="property-spec-group-title" id={`spec-group-${group.id}`}>
                      {group.title}
                      <span className="property-spec-group-count">
                        {group.facts.length.toLocaleString("fa-IR")}
                      </span>
                    </h3>
                    <div className="property-spec-grid">
                      {group.facts.map((fact) => (
                        <div className="property-spec-item" key={fact.id}>
                          <span className="property-spec-item-icon" aria-hidden="true">
                            {fact.icon}
                          </span>
                          <span>
                            <small>{fact.label}</small>
                            <strong>{fact.value}</strong>
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              {property.otherAmenities.length || property.coolingSystem || property.heatingSystem ? (
                <details className="property-spec-amenities">
                  <summary>
                    <span className="property-spec-amenities-title">
                      <Sparkles size={18} aria-hidden="true" />
                      <span>
                        <small>امکانات تکمیلی</small>
                        <strong>امکانات دیگر</strong>
                      </span>
                    </span>
                    <span className="property-spec-amenities-toggle">
                      <small>{amenityCount.toLocaleString("fa-IR")} مورد</small>
                      <ChevronDown size={19} aria-hidden="true" />
                    </span>
                  </summary>
                  <div className="property-spec-amenities-body">
                    {property.coolingSystem ? (
                      <div className="property-spec-amenity-item" key={"cooling:" + property.coolingSystem}>
                        {propertyAmenityIcon("cooling")}
                        <span>
                          <small>سیستم سرمایش</small>
                          <strong>{labelForOption(PROPERTY_COOLING_OPTIONS, property.coolingSystem)}</strong>
                        </span>
                      </div>
                    ) : null}
                    {property.heatingSystem ? (
                      <div className="property-spec-amenity-item" key={"heating:" + property.heatingSystem}>
                        {propertyAmenityIcon("heating")}
                        <span>
                          <small>سیستم گرمایش</small>
                          <strong>{labelForOption(PROPERTY_HEATING_OPTIONS, property.heatingSystem)}</strong>
                        </span>
                      </div>
                    ) : null}
                    {property.otherAmenities.map((value, index) => (
                      <div className="property-spec-amenity-item" key={value + "-" + index}>
                        {propertyAmenityIcon(value)}
                        <span>
                          <small>امکانات</small>
                          <strong>{propertyAmenityLabel(value)}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
                </div>
              </details>
            </section>

            <section id="property-description-section" className="property-detail-body" aria-labelledby="property-description-title">
              <div className="property-section-heading">
                <div>
                  <span className="kicker">توضیحات فایل</span>
                  <h2 id="property-description-title">شرح کامل ملک</h2>
                </div>
                <span className="property-source-badge">متن اصلی آگهی</span>
              </div>

              <div className="property-description-meta" aria-label="زمان انتشار و به‌روزرسانی">
                {property.publishedAt ? (
                  <span>
                    <strong>انتشار</strong>
                    <time dateTime={property.publishedAt}>{formatAdDate(property.publishedAt)}</time>
                  </span>
                ) : null}
                {property.updatedAt ? (
                  <span>
                    <strong>آخرین به‌روزرسانی</strong>
                    <time dateTime={property.updatedAt}>{formatAdDate(property.updatedAt)}</time>
                  </span>
                ) : null}
              </div>

              <div className="property-description-copy">
                <p className="property-description-lead">{descriptionSummary}</p>

                {descriptionParagraphs.length > 1 ? (
                  <details className="property-description-full">
                    <summary>
                      <span>مشاهده توضیحات کامل فایل</span>
                      <ChevronDown size={17} aria-hidden="true" />
                    </summary>
                    <div className="property-description-full-body">
                      {descriptionParagraphs.slice(1).map((paragraph, index) => (
                        <p key={index + 1}>{paragraph}</p>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>

              {property.features.length ? (
                <div className="property-features">
                  <div className="property-section-subheading">
                    <h3>ویژگی‌های ثبت‌شده در آگهی</h3>
                    <span>{property.features.length.toLocaleString("fa-IR")} مورد</span>
                  </div>

                  <ul className="property-features-preview">
                    {property.features.slice(0, 6).map((f, index) => (
                      <li key={f + "-" + index}>
                        <Check size={15} aria-hidden="true" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {property.features.length > 6 ? (
                    <details className="property-features-more">
                      <summary>
                        <span>مشاهده تمام ویژگی‌های آگهی</span>
                        <small>{(property.features.length - 6).toLocaleString("fa-IR")} مورد دیگر</small>
                        <ChevronDown size={16} aria-hidden="true" />
                      </summary>
                      <ul>
                        {property.features.slice(6).map((f, index) => (
                          <li key={f + "-more-" + index}>
                            <Check size={15} aria-hidden="true" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="property-detail-insight-grid" aria-label="اطلاعات تحلیلی فایل">
              <PropertyVerificationStamp property={property} />
              <PropertyMarketComparison property={property} />
            </section>

            {priceHistory.length ? (
              <section id="property-price-history-section" className="property-price-history" aria-labelledby="property-price-history-title">
                <div className="property-section-heading">
                  <div>
                    <span className="kicker">شفافیت قیمت</span>
                    <h2 id="property-price-history-title">روند تغییر قیمت و شرایط مالی</h2>
                  </div>
                  <span className="property-source-badge">
                    {priceHistory.length.toLocaleString("fa-IR")} تغییر ثبت‌شده
                  </span>
                </div>
                <div className="property-price-history-list">
                  {priceHistory.slice(0, 2).map((item, index) => {
                    const changes: Array<{ label: string; previous: string | null; next: string | null }> = [];
                    if (item.previousPrice !== item.newPrice) {
                      changes.push({ label: "قیمت کل", previous: item.previousPrice, next: item.newPrice });
                    }
                    if (item.previousDeposit !== item.newDeposit) {
                      changes.push({ label: "رهن", previous: item.previousDeposit, next: item.newDeposit });
                    }
                    if (item.previousRent !== item.newRent) {
                      changes.push({ label: "اجاره", previous: item.previousRent, next: item.newRent });
                    }

                    return (
                      <article className="property-price-history-item" key={item.changedAt + "-" + index}>
                        <div className="property-price-history-date">
                          <ArrowDownRight size={16} aria-hidden="true" />
                          <time dateTime={item.changedAt}>{formatAdDate(item.changedAt)}</time>
                        </div>
                        <div className="property-price-history-changes">
                          {changes.map((change) => {
                            const previous = change.previous ? formatToman(Number(change.previous)) + " تومان" : "ثبت نشده";
                            const nextValue = change.next ? formatToman(Number(change.next)) + " تومان" : "حذف شد";
                            return (
                              <div className="property-price-history-change" key={change.label}>
                                <span>{change.label}</span>
                                <strong>{previous}</strong>
                                <b>→</b>
                                <strong className="is-current">{nextValue}</strong>
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {priceHistory.length > 2 ? (
                  <details className="property-price-history-more">
                    <summary>
                      <span>مشاهده تمام تغییرات قیمت</span>
                      <small>{(priceHistory.length - 2).toLocaleString("fa-IR")} مورد دیگر</small>
                      <ChevronDown size={16} aria-hidden="true" />
                    </summary>
                    <div className="property-price-history-list">
                      {priceHistory.slice(2).map((item, index) => {
                        const changes: Array<{ label: string; previous: string | null; next: string | null }> = [];
                        if (item.previousPrice !== item.newPrice) {
                          changes.push({ label: "قیمت کل", previous: item.previousPrice, next: item.newPrice });
                        }
                        if (item.previousDeposit !== item.newDeposit) {
                          changes.push({ label: "رهن", previous: item.previousDeposit, next: item.newDeposit });
                        }
                        if (item.previousRent !== item.newRent) {
                          changes.push({ label: "اجاره", previous: item.previousRent, next: item.newRent });
                        }

                        return (
                          <article className="property-price-history-item" key={item.changedAt + "-more-" + index}>
                            <div className="property-price-history-date">
                              <ArrowDownRight size={16} aria-hidden="true" />
                              <time dateTime={item.changedAt}>{formatAdDate(item.changedAt)}</time>
                            </div>
                            <div className="property-price-history-changes">
                              {changes.map((change) => {
                                const previous = change.previous ? formatToman(Number(change.previous)) + " تومان" : "ثبت نشده";
                                const nextValue = change.next ? formatToman(Number(change.next)) + " تومان" : "حذف شد";
                                return (
                                  <div className="property-price-history-change" key={change.label}>
                                    <span>{change.label}</span>
                                    <strong>{previous}</strong>
                                    <b>→</b>
                                    <strong className="is-current">{nextValue}</strong>
                                  </div>
                                );
                              })}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </details>
                ) : null}
                <p className="property-price-history-note">
                  این سابقه فقط تغییرات ثبت‌شده در سامانه هیرمند را نشان می‌دهد و جایگزین بررسی شرایط نهایی معامله نیست.
                </p>
              </section>
            ) : null}

            {(property.latitude != null && property.longitude != null) || property.neighborhood ? (
              <section id="property-location-section" className="property-location-section" aria-labelledby="property-location-title">
                <div className="property-section-heading">
                  <div>
                    <span className="kicker">موقعیت</span>
                    <h2 id="property-location-title">موقعیت تقریبی فایل روی نقشه</h2>
                  </div>
                  <MapPinned size={20} aria-hidden="true" />
                </div>
                {property.latitude != null && property.longitude != null ? (
                  <div className="property-map-card">
                    <iframe
                      title={`موقعیت ${property.title}`}
                      src={osmEmbedUrl(property.latitude, property.longitude)}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                    <div className="property-map-actions">
                      <span>اصفهان · {property.neighborhood} · موقعیت تقریبی</span>
                      <div className="property-map-action-group">
                        <button
                          type="button"
                          className="btn-gold"
                          onClick={() => openDirectionsFromHere(property.latitude, property.longitude, property.neighborhood)}
                        >
                          <Navigation size={15} aria-hidden="true" /> مسیریابی از موقعیت من
                        </button>
                        <a
                          href={mapsLink(property.latitude, property.longitude, property.neighborhood)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-ghost"
                        >
                          <ExternalLink size={15} aria-hidden="true" /> باز کردن در نقشه
                        </a>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="property-location-fallback">
                    <MapPinned size={20} aria-hidden="true" />
                    <div>
                      <strong>محدوده تقریبی فایل</strong>
                      <p>اصفهان، {property.neighborhood}</p>
                    </div>
                    <div className="property-map-action-group">
                      <button
                        type="button"
                        className="btn-gold"
                        onClick={() => openDirectionsFromHere(null, null, property.neighborhood)}
                      >
                        <Navigation size={15} aria-hidden="true" /> مسیریابی از موقعیت من
                      </button>
                      <a
                        href={mapsLink(null, null, property.neighborhood)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost"
                      >
                        <ExternalLink size={15} aria-hidden="true" /> جستجو در نقشه
                      </a>
                    </div>
                  </div>
                )}
              </section>
            ) : null}

            <PropertyFloorPlan property={property} />
            <PropertyNearbyServices property={property} />

            <section
              id="property-final-cta"
              className={"property-final-cta" + (isClosedFile ? " property-final-cta-closed" : "")}
              aria-label={canRequestViewing ? "درخواست بازدید و اطلاعات بیشتر" : "پیگیری وضعیت فایل و اطلاعات بیشتر"}
            >
              <div>
                <span className="kicker">{canRequestViewing ? "قدم بعدی" : "وضعیت فایل"}</span>
                <h2>
                  {canRequestViewing
                    ? "برای بازدید یا اطلاعات بیشتر با مشاور فایل در ارتباط باشید."
                    : "این فایل در حال حاضر برای بازدید جدید در دسترس نیست."}
                </h2>
                <p>
                  {canRequestViewing
                    ? "برای هماهنگی بازدید، دریافت توضیحات تکمیلی یا بررسی شرایط معامله تماس بگیرید."
                    : "برای پیگیری وضعیت این فایل یا پیدا کردن گزینه‌های مشابه با مشاور هیرمند در ارتباط باشید."}
                </p>
              </div>
              <div className="property-final-cta-actions">
                <a
                  href={`tel:${property.contactPhone}`}
                  onClick={() => trackAnalyticsEvent("call_click", property.slug)}
                  className="btn-gold"
                >
                  <Phone size={17} aria-hidden="true" />
                  تماس تلفنی
                </a>
                <a
                  href={whatsappLink(property.contactPhone, property.title)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackAnalyticsEvent("whatsapp_click", property.slug)}
                  className="btn-ghost"
                >
                  <WhatsAppIcon size={17} aria-hidden="true" />
                  واتساپ
                </a>
                {canRequestViewing ? (
                  <PropertyViewingRequest
                    property={{
                      id: property.id,
                      slug: property.slug,
                      title: property.title,
                      neighborhood: property.neighborhood,
                      availabilityStatus: property.availabilityStatus,
                    }}
                  />
                ) : (
                  <a
                    href={similarRequestHref(property)}
                    className="btn-ghost property-final-cta-similar"
                    onClick={() => trackAnalyticsEvent("inquiry_click", property.slug)}
                  >
                    <Sparkles size={17} aria-hidden="true" />
                    پیدا کردن فایل مشابه
                  </a>
                )}
              </div>
            </section>


        {related.length ? (
          <section className="property-related" aria-labelledby="related-properties-title">
            <div className="section-head">
              <span className="kicker">پیشنهاد هیرمند</span>
              <h2 id="related-properties-title">فایل‌های مشابه</h2>
              <p>چند گزینه نزدیک به این فایل، بر اساس محله و نوع ملک.</p>
            </div>
            <div className="property-grid">
              {related.slice(0, 3).map((item) => (
                <PropertyCard key={item.id} property={item} />
              ))}
            </div>
          </section>
        ) : null}

            <details className="property-secondary-services">
              <summary className="property-secondary-services-summary">
                <span className="property-secondary-services-main">
                  <span className="property-secondary-services-icon"><Sparkles size={17} aria-hidden="true" /></span>
                  <span>
                    <strong>خدمات و امکانات تکمیلی</strong>
                    <small>بازدید، تأمین مالی، بررسی اطلاعات، مدارک و ارتباط با هیرمند</small>
                  </span>
                </span>
                <span className="property-secondary-services-meta">
                  <span>اختیاری</span>
                  <ChevronDown size={18} aria-hidden="true" />
                </span>
              </summary>
              <div className="property-secondary-services-content">
{isClosedFile ? (
              <PropertyBackInMarketAlert
                slug={property.slug}
                title={property.title}
                availabilityStatus={property.availabilityStatus}
              />
            ) : null}
            {(property.transactionType === "buy" || property.transactionType === "sell") ? (
              <PropertyFinancingRequest property={property} />
            ) : null}
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





            <section id="property-tools-section" className="property-tool-center" aria-labelledby="property-tool-center-title">
              <header className="property-tool-center-head">
                <div>
                  <span className="kicker">ابزارهای تکمیلی فایل</span>
                  <h2 id="property-tool-center-title">ابزارهای هوشمند این فایل</h2>
                  <p>
                    اطلاعات اصلی ملک در بالا متمرکز است؛ این ابزارها را فقط زمانی باز کنید که برای بررسی، محاسبه،
                    مذاکره یا مدیریت بازدید به آن‌ها نیاز دارید.
                  </p>
                </div>
                <span className="property-tool-center-badge">همه قابلیت‌ها · اختیاری</span>
              </header>

              <details className="property-tool-category">
                <summary className="property-tool-category-summary">
                  <span className="property-tool-category-main">
                    <span className="property-tool-category-index">۰۱</span>
                    <span className="property-tool-category-copy">
                      <strong>بررسی و تصمیم‌گیری</strong>
                      <span>تناسب فایل، بازدید، آمادگی تصمیم، سناریو و بررسی ریسک</span>
                    </span>
                  </span>
                  <span className="property-tool-category-meta">
                    <span className="property-tool-category-count">۸ ابزار</span>
                    <span className="property-tool-category-chevron" aria-hidden="true">
                      <ChevronDown size={17} />
                    </span>
                  </span>
                </summary>
                <div className="property-tool-category-content">
                  <div className="property-tool-category-content-inner">
                    <div className="property-tool-category-stack">
                      <PropertyDecisionTools property={property} />
                      <PropertyVisitChecklist property={property} />
                      <PropertyDecisionReadiness property={property} />
                      <PropertyScenarioAnalysis property={property} />
                      <PropertyPersonalScore property={property} />
                      <PropertyRiskRadar property={property} />
                      <PropertyReviewAlerts property={property} />
                      <PropertyVisitOutcome property={property} />
                    </div>
                  </div>
                </div>
              </details>

              <details className="property-tool-category">
                <summary className="property-tool-category-summary">
                  <span className="property-tool-category-main">
                    <span className="property-tool-category-index">۰۲</span>
                    <span className="property-tool-category-copy">
                      <strong>مالی و محاسبات معامله</strong>
                      <span>هزینه مالکیت، برنامه پرداخت و تبدیل رهن و اجاره</span>
                    </span>
                  </span>
                  <span className="property-tool-category-meta">
                    <span className="property-tool-category-count">۳ ابزار</span>
                    <span className="property-tool-category-chevron" aria-hidden="true">
                      <ChevronDown size={17} />
                    </span>
                  </span>
                </summary>
                <div className="property-tool-category-content">
                  <div className="property-tool-category-content-inner">
                    <div className="property-tool-category-stack">
                      <PropertyOwnershipCost property={property} />
                      <PropertyPaymentPlanner property={property} />
                      <PropertyConvertSlider property={property} />
                    </div>
                  </div>
                </div>
              </details>

              <details className="property-tool-category">
                <summary className="property-tool-category-summary">
                  <span className="property-tool-category-main">
                    <span className="property-tool-category-index">۰۳</span>
                    <span className="property-tool-category-copy">
                      <strong>مذاکره و آماده‌سازی معامله</strong>
                      <span>پیشنهاد، چک‌لیست، اتاق معامله و پرونده تصمیم</span>
                    </span>
                  </span>
                  <span className="property-tool-category-meta">
                    <span className="property-tool-category-count">۴ ابزار</span>
                    <span className="property-tool-category-chevron" aria-hidden="true">
                      <ChevronDown size={17} />
                    </span>
                  </span>
                </summary>
                <div className="property-tool-category-content">
                  <div className="property-tool-category-content-inner">
                    <div className="property-tool-category-stack">
                      <PropertyOfferMessage property={property} />
                      <PropertyDealChecklist property={property} />
                      <PropertyDealRoom property={property} />
                      <PropertyDecisionDossier property={property} />
                    </div>
                  </div>
                </div>
              </details>

              <details className="property-tool-category">
                <summary className="property-tool-category-summary">
                  <span className="property-tool-category-main">
                    <span className="property-tool-category-index">۰۴</span>
                    <span className="property-tool-category-copy">
                      <strong>مدارک و هماهنگی</strong>
                      <span>مدارک موردنیاز و ابزارهای تکمیلی برای پرسش و هماهنگی</span>
                    </span>
                  </span>
                  <span className="property-tool-category-meta">
                    <span className="property-tool-category-count">۲ ابزار</span>
                    <span className="property-tool-category-chevron" aria-hidden="true">
                      <ChevronDown size={17} />
                    </span>
                  </span>
                </summary>
                <div className="property-tool-category-content">
                  <div className="property-tool-category-content-inner">
                    <div className="property-tool-category-stack">
                      <PropertyDocumentPack property={property} />
                      <PropertyInquiryTools property={property} />
                    </div>
                  </div>
                </div>
              </details>

              <details className="property-tool-category property-tool-personal">
                <summary className="property-tool-category-summary">
                  <span className="property-tool-category-main">
                    <span className="property-tool-category-index">۰۵</span>
                    <span className="property-tool-category-copy">
                      <strong>دفتر شخصی این فایل</strong>
                      <span>یادداشت‌ها، پیگیری، مذاکره و گزارش‌های شخصی شما درباره این ملک</span>
                    </span>
                  </span>
                  <span className="property-tool-category-meta">
                    <span className="property-tool-category-count">۶ ابزار</span>
                    <span className="property-tool-category-chevron" aria-hidden="true">
                      <ChevronDown size={17} aria-hidden="true" />
                    </span>
                  </span>
                </summary>
                <div className="property-tool-category-content">
                  <div className="property-tool-category-content-inner">
                    <div className="property-tool-category-stack">
                      <PropertyNegotiationLog property={property} />
                      <PropertyFollowUpReminder property={property} />
                      <PropertyQuestionLog property={property} />
                      <PropertyVisitReport property={property} />
                      <PropertyRenovationTracker property={property} />
                      <PropertyPhotoNotes property={property} />
                    </div>
                  </div>
                </div>
              </details>
            </section>

            <Link
              to="/properties"
              className="text-link"
              style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
            >
              <ArrowRight size={16} /> بازگشت به فهرست فایل‌ها
            </Link>
          </article>

          <aside className="property-detail-aside" aria-label="اطلاعات و اقدام‌های فایل">
            <div className="property-detail-aside-inner">
              <ConsultantCard property={property} />


            </div>
          </aside>
        </section>

        <div className="property-mobile-actions" role="group" aria-label="اقدام‌های سریع فایل">
          <a
            href={`tel:${property.contactPhone}`}
            className="property-mobile-action property-mobile-action-call"
            onClick={() => trackAnalyticsEvent("call_click", property.slug)}
          >
            <Phone size={18} aria-hidden="true" />
            <span>تماس</span>
          </a>
          <a
            href={whatsappLink(property.contactPhone, property.title)}
            target="_blank"
            rel="noopener noreferrer"
            className="property-mobile-action"
            onClick={() => trackAnalyticsEvent("whatsapp_click", property.slug)}
          >
            <WhatsAppIcon size={18} aria-hidden="true" />
            <span>واتساپ</span>
          </a>
          <a
            href="#property-final-cta"
            className="property-mobile-action"
            onClick={() => trackAnalyticsEvent(canRequestViewing ? "viewing_cta_jump" : "inquiry_click", property.slug)}
          >
            {canRequestViewing ? (
              <CalendarDays size={18} aria-hidden="true" />
            ) : (
              <Sparkles size={18} aria-hidden="true" />
            )}
            <span>{canRequestViewing ? "درخواست بازدید" : "فایل مشابه"}</span>
          </a>
          <button
            type="button"
            className="property-mobile-action"
            onClick={() => void shareCurrentProperty(property)}
          >
            <Share2 size={18} aria-hidden="true" />
            <span>اشتراک</span>
          </button>
        </div>

      </main>
    </SiteChrome>
  );
}