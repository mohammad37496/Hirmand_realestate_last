import { useEffect, useState, type MouseEvent } from "react";
import { ArrowLeftRight, FileText, Heart, Image as ImageIcon, Printer, QrCode, Share2, X } from "lucide-react";
import { toast } from "sonner";
import type { PropertyCardData } from "@/lib/properties";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { propertyPath } from "@/lib/property-path";
import { SITE } from "@/lib/site";

/** Absolute URL for a property, safe during SSR (no `window`). */
function absolutePropertyUrl(property: Pick<PropertyCardData, "id" | "slug">): string {
  return new URL(propertyPath(property), SITE.url).toString();
}

const FAVORITES_KEY = "hirmand-favorite-properties";
const COMPARE_KEY = "hirmand-compare-properties";
const MAX_COMPARE = 3;

type PropertyShareCardData = Pick<
  PropertyCardData,
  "id" | "slug" | "title" | "neighborhood" | "transactionType" | "propertyType" | "price" | "deposit" | "rent"
> & {
  image?: string | null;
  images?: string[];
};

const TRANSACTION_LABEL: Record<PropertyCardData["transactionType"], string> = {
  buy: "خرید",
  sell: "فروش",
  rent: "اجاره",
  mortgage: "رهن",
};

const PROPERTY_TYPE_LABEL: Record<PropertyCardData["propertyType"], string> = {
  apartment: "آپارتمان",
  villa: "ویلا و باغ",
  office: "اداری",
  heritage: "خانه اصیل",
  land: "زمین",
  commercial: "تجاری",
};

function shareCardPrice(property: PropertyShareCardData) {
  const money = (value: string | null | undefined) => {
    const digits = String(value ?? "").replace(/[^0-9]/g, "");
    return digits ? Number(digits).toLocaleString("fa-IR") : "";
  };

  if (property.transactionType === "rent") {
    const deposit = money(property.deposit);
    const rent = money(property.rent);
    if (deposit && rent) return `رهن ${deposit} + اجاره ${rent} تومان`;
    if (deposit) return `رهن ${deposit} تومان`;
    if (rent) return `اجاره ${rent} تومان`;
  }

  if (property.transactionType === "mortgage") {
    const deposit = money(property.deposit);
    return deposit ? `رهن ${deposit} تومان` : "برای قیمت تماس بگیرید";
  }

  const price = money(property.price);
  return price ? `قیمت ${price} تومان` : "برای قیمت تماس بگیرید";
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function createShareCardSvg(property: PropertyShareCardData, url: string) {
  const title = escapeXml(property.title.trim().slice(0, 72));
  const neighborhood = escapeXml(property.neighborhood?.trim().slice(0, 42) || "اصفهان");
  const transaction = escapeXml(TRANSACTION_LABEL[property.transactionType]);
  const type = escapeXml(PROPERTY_TYPE_LABEL[property.propertyType]);
  const price = escapeXml(shareCardPrice(property));
  const safeUrl = escapeXml(url);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630">
        <stop offset="0" stop-color="#071523"/>
        <stop offset="1" stop-color="#102b41"/>
      </linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#e7c67a"/>
        <stop offset="1" stop-color="#a7792c"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="16" stdDeviation="22" flood-opacity=".28"/>
      </filter>
    </defs>

    <rect width="1200" height="630" rx="34" fill="url(#bg)"/>
    <rect x="34" y="34" width="1132" height="562" rx="28" fill="none" stroke="#d6ae55" stroke-opacity=".3"/>
    <circle cx="1050" cy="118" r="130" fill="#d6ae55" fill-opacity=".08"/>
    <circle cx="110" cy="550" r="180" fill="#d6ae55" fill-opacity=".06"/>

    <text x="78" y="100" fill="#e8c873" font-family="Vazirmatn, Arial, sans-serif" font-size="30" font-weight="800">HIRMAND REAL ESTATE</text>
    <text x="78" y="140" fill="#b8c6d3" font-family="Vazirmatn, Arial, sans-serif" font-size="18">معرفی فایل ملکی</text>

    <rect x="78" y="188" width="1044" height="310" rx="26" fill="#ffffff" fill-opacity=".065" stroke="#ffffff" stroke-opacity=".1" filter="url(#shadow)"/>

    <text x="1020" y="245" text-anchor="end" direction="rtl" fill="#ffffff"
      font-family="Vazirmatn, Arial, sans-serif" font-size="42" font-weight="900">${title}</text>

    <text x="1020" y="292" text-anchor="end" direction="rtl" fill="#d8e2ec"
      font-family="Vazirmatn, Arial, sans-serif" font-size="23">${type} · ${transaction} · ${neighborhood}</text>

    <rect x="760" y="340" width="260" height="78" rx="20" fill="url(#gold)"/>
    <text x="890" y="389" text-anchor="middle" direction="rtl" fill="#101923"
      font-family="Vazirmatn, Arial, sans-serif" font-size="22" font-weight="900">${price}</text>

    <text x="1020" y="457" text-anchor="end" fill="#9fb0bf"
      font-family="Arial, sans-serif" font-size="15">${safeUrl}</text>

    <text x="100" y="550" fill="#f4f7fa" font-family="Vazirmatn, Arial, sans-serif" font-size="20" font-weight="700">برای بازدید و اطلاعات بیشتر با هیرمند تماس بگیرید</text>
    <text x="1120" y="550" text-anchor="end" fill="#d8b55e" font-family="Vazirmatn, Arial, sans-serif" font-size="20" font-weight="800">اصفهان</text>
  </svg>`;
}

async function svgToPng(svg: string): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas-unavailable");
    context.drawImage(image, 0, 0, 1200, 630);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("png-export-failed"));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function createShareCard(property: PropertyShareCardData) {
  const url = new URL(propertyPath(property), window.location.origin).toString();
  const svg = createShareCardSvg(property, url);
  const png = await svgToPng(svg);
  return { url, png };
}


function buildPropertyAdText(property: PropertyShareCardData, url: string) {
  const money = (value: string | null | undefined) => {
    const digits = String(value ?? "").replace(/[^0-9]/g, "");
    return digits ? Number(digits).toLocaleString("fa-IR") + " تومان" : "";
  };
  const price =
    property.transactionType === "rent"
      ? [
          property.deposit ? `رهن: ${money(property.deposit)}` : "",
          property.rent ? `اجاره: ${money(property.rent)}` : "",
        ].filter(Boolean).join(" | ") || "قیمت توافقی"
      : property.transactionType === "mortgage"
        ? (property.deposit ? `رهن: ${money(property.deposit)}` : "قیمت توافقی")
        : (property.price ? `قیمت: ${money(property.price)}` : "قیمت توافقی");
  return [
    "🏠 املاک هیرمند",
    property.title,
    `${TRANSACTION_LABEL[property.transactionType]} · ${PROPERTY_TYPE_LABEL[property.propertyType]}`,
    `محله: ${property.neighborhood}`,
    price,
    "برای اطلاعات بیشتر و بازدید:",
    url,
  ].filter(Boolean).join("\n");
}

function copyPropertyAdText(property: PropertyShareCardData) {
  const url = new URL(propertyPath(property), window.location.origin).toString();
  const text = buildPropertyAdText(property, url);
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => {
      toast.success("متن آماده آگهی کپی شد.");
      trackAnalyticsEvent("property_share", property.slug);
    });
  }
  window.prompt("متن آماده آگهی:", text);
  return Promise.resolve();
}

function readCompare(): string[] {
  try {
    const raw = localStorage.getItem(COMPARE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(
      parsed.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0 && item.length <= 220,
      ).map((item) => item.trim()),
    )).slice(0, MAX_COMPARE);
  } catch {
    return [];
  }
}

function toggleCompare(slug: string): { added: boolean; next: string[] } {
  const current = readCompare();
  if (current.includes(slug)) {
    const next = current.filter((item) => item !== slug);
    try {
      localStorage.setItem(COMPARE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage failures in private browsing contexts.
    }
    return { added: false, next };
  }
  if (current.length >= MAX_COMPARE) return { added: false, next: current };
  const next = [...current, slug];
  try {
    localStorage.setItem(COMPARE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures in private browsing contexts.
    return { added: false, next: current };
  }
  return { added: true, next };
}

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(
      parsed.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0 && item.length <= 220,
      ).map((item) => item.trim()),
    )).slice(-100);
  } catch {
    return [];
  }
}

function toggleFavorite(slug: string): { added: boolean; persisted: boolean } {
  const current = readFavorites();
  const exists = current.includes(slug);
  const next = exists
    ? current.filter((item) => item !== slug)
    : [...current, slug];

  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next.slice(-100)));
    return { added: !exists, persisted: true };
  } catch {
    return { added: !exists, persisted: false };
  }
}

async function shareProperty(property: PropertyShareCardData) {
  const url = new URL(propertyPath(property), window.location.origin).toString();
  const shareData = {
    title: property.title,
    text: `فایل «${property.title}» در هیرمند`,
    url,
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      toast.success("لینک فایل کپی شد.");
    } else {
      toast.info(url);
      return;
    }

    trackAnalyticsEvent("property_share", property.slug);
  } catch {
    // User cancelled the native share sheet.
  }
}

async function sharePropertyCard(property: PropertyShareCardData) {
  try {
    const { url, png } = await createShareCard(property);
    const file = new File([png], "hirmand-property-card.png", { type: "image/png" });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: property.title,
        text: `کارت معرفی فایل «${property.title}» در هیرمند`,
        files: [file],
      });
      trackAnalyticsEvent("property_share", property.slug);
      return;
    }

    const link = document.createElement("a");
    link.href = URL.createObjectURL(png);
    link.download = `hirmand-${property.slug || property.id}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    toast.success("کارت معرفی فایل ذخیره شد؛ می‌توانید آن را در واتساپ یا تلگرام ارسال کنید.");
    trackAnalyticsEvent("property_share", property.slug);
    void url;
  } catch (error) {
    console.error("[property-share-card]", error);
    toast.error("ساخت کارت معرفی فایل انجام نشد.");
  }
}

export function PropertyActions({
  property,
  compact = false,
}: {
  property: PropertyShareCardData;
  compact?: boolean;
}) {
  const [favorite, setFavorite] = useState(false);
  const [compared, setCompared] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);

  useEffect(() => {
    setFavorite(readFavorites().includes(property.slug));
    setCompared(readCompare().includes(property.slug));
  }, [property.slug]);
  useEffect(() => {
    if (!qrOpen && !briefOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setQrOpen(false);
        setBriefOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [qrOpen, briefOpen]);

  useEffect(() => {
    if (!qrOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQrOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [qrOpen]);

  function onFavorite(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const result = toggleFavorite(property.slug);
    if (!result.persisted) {
      toast.error("ذخیره‌سازی در این مرورگر ممکن نشد.");
      return;
    }
    setFavorite(result.added);
    trackAnalyticsEvent("property_favorite", property.slug);
    toast.success(result.added ? "فایل در ذخیره‌ها قرار گرفت." : "فایل از ذخیره‌ها حذف شد.");
  }

  function onShare(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    void shareProperty(property);
  }

  function onShareCard(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    void sharePropertyCard(property);
  }

  function onQr(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setQrOpen(true);
  }

  function closeQr(event?: MouseEvent) {
    event?.preventDefault();
    event?.stopPropagation();
    setQrOpen(false);
  }

  function onPrint(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    window.setTimeout(() => window.print(), 50);
  }

  function onCompare(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const current = readCompare();
    if (!compared && current.length >= MAX_COMPARE) {
      toast.info("برای مقایسه هم‌زمان حداکثر ۳ فایل انتخاب کنید.");
      return;
    }

    const result = toggleCompare(property.slug);
    setCompared(result.added);
    trackAnalyticsEvent("property_compare", property.slug);
    toast.success(
      result.added
        ? "فایل به مقایسه اضافه شد."
        : "فایل از مقایسه حذف شد.",
    );
  }


  const qrTarget = absolutePropertyUrl(property);
  const qrImageUrl = "https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=12&data=" + encodeURIComponent(qrTarget);

  return (
    <>
    <div className={`property-actions${compact ? " property-actions-compact" : ""}`}>
      <button
        type="button"
        className={`property-action${favorite ? " is-active" : ""}`}
        onClick={onFavorite}
        aria-label={favorite ? "حذف از ذخیره‌ها" : "ذخیره فایل"}
        aria-pressed={favorite}
        title={favorite ? "حذف از ذخیره‌ها" : "ذخیره فایل"}
      >
        <Heart size={compact ? 17 : 16} fill={favorite ? "currentColor" : "none"} />
        {!compact ? <span>{favorite ? "ذخیره‌شده" : "ذخیره فایل"}</span> : null}
      </button>
      <button
        type="button"
        className="property-action"
        onClick={onShare}
        aria-label="اشتراک‌گذاری فایل"
        title="اشتراک‌گذاری"
      >
        <Share2 size={compact ? 17 : 16} />
        {!compact ? <span>اشتراک‌گذاری</span> : null}
      </button>
      <button
        type="button"
        className="property-action"
        onClick={onShareCard}
        aria-label="ساخت کارت معرفی فایل"
        title="کارت معرفی فایل"
      >
        <ImageIcon size={compact ? 17 : 16} />
        {!compact ? <span>کارت معرفی</span> : null}
      </button>
      <button
        type="button"
        className="property-action"
        onClick={onQr}
        aria-label="نمایش QR فایل"
        title="QR فایل"
      >
        <QrCode size={compact ? 17 : 16} />
        {!compact ? <span>QR فایل</span> : null}
      </button>
      <button
        type="button"
        className="property-action"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setBriefOpen(true);
        }}
        aria-label="برگه معرفی فایل"
        title="برگه معرفی"
      >
        <FileText size={compact ? 17 : 16} />
        {!compact ? <span>برگه معرفی</span> : null}
      </button>
      <button
        type="button"
        className="property-action"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void copyPropertyAdText(property);
        }}
        aria-label="کپی متن آگهی"
        title="کپی متن آگهی"
      >
        <FileText size={compact ? 17 : 16} />
        {!compact ? <span>متن آگهی</span> : null}
      </button>
            <button
        type="button"
        className="property-action"
        onClick={onPrint}
        aria-label="چاپ فایل"
        title="چاپ فایل"
      >
        <Printer size={compact ? 17 : 16} />
        {!compact ? <span>چاپ فایل</span> : null}
      </button>
      <button
        type="button"
        className={`property-action${compared ? " is-active" : ""}`}
        onClick={onCompare}
        aria-label={compared ? "حذف از مقایسه" : "افزودن به مقایسه"}
        aria-pressed={compared}
        title={compared ? "حذف از مقایسه" : "مقایسه فایل"}
      >
        <ArrowLeftRight size={compact ? 17 : 16} />
        {!compact ? <span>{compared ? "در مقایسه" : "مقایسه"}</span> : null}
      </button>
    </div>
    {briefOpen ? (
      <div
        className="property-brief-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setBriefOpen(false);
        }}
      >
        <section className="property-brief-dialog" role="dialog" aria-modal="true" aria-labelledby={`property-brief-title-${property.id}`}>
          <div className="property-brief-actions no-print">
            <button type="button" className="property-brief-close" onClick={() => setBriefOpen(false)} aria-label="بستن">
              <X size={18} />
            </button>
          </div>
          <div className="property-brief-brand">
            <div>
              <span>HIRMAND REAL ESTATE</span>
              <strong>املاک هیرمند</strong>
            </div>
            <b>برگه معرفی فایل</b>
          </div>
          <div className="property-brief-main">
            <span className="kicker">{TRANSACTION_LABEL[property.transactionType]} · {PROPERTY_TYPE_LABEL[property.propertyType]}</span>
            <h2 id={`property-brief-title-${property.id}`}>{property.title}</h2>
            <p>{property.neighborhood}</p>
          </div>
          <div className="property-brief-price">{shareCardPrice(property)}</div>
          <div className="property-brief-grid">
            <div><span>محله</span><strong>{property.neighborhood}</strong></div>
            <div><span>نوع ملک</span><strong>{PROPERTY_TYPE_LABEL[property.propertyType]}</strong></div>
            <div><span>نوع معامله</span><strong>{TRANSACTION_LABEL[property.transactionType]}</strong></div>
            <div><span>کد فایل</span><strong dir="ltr">{property.id.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase()}</strong></div>
          </div>
          <div className="property-brief-url" dir="ltr">{absolutePropertyUrl(property)}</div>
          <p className="property-brief-note">این برگه برای اشتراک‌گذاری و چاپ طراحی شده است. برای قیمت و شرایط نهایی با مشاور هیرمند هماهنگ کنید.</p>
          <div className="property-brief-footer">
            <span>املاک هیرمند · اصفهان</span>
            <div className="no-print">
              <button type="button" className="btn-gold" onClick={() => window.print()}>
                <Printer size={16} /> چاپ / ذخیره PDF
              </button>
              <button type="button" className="btn-ghost" onClick={() => setBriefOpen(false)}>بستن</button>
            </div>
          </div>
        </section>
      </div>
    ) : null}

    {qrOpen ? (
      <div
        className="property-qr-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeQr(event);
        }}
      >
        <section
          className="property-qr-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`property-qr-title-${property.id}`}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="property-qr-close"
            onClick={(event) => closeQr(event)}
            aria-label="بستن QR"
            title="بستن"
          >
            <X size={18} />
          </button>

          <div className="property-qr-head">
            <span className="property-qr-icon" aria-hidden="true"><QrCode size={22} /></span>
            <div>
              <span className="kicker">اشتراک سریع</span>
              <h2 id={`property-qr-title-${property.id}`}>QR اختصاصی این فایل</h2>
              <p>با اسکن این کد، صفحه جزئیات همین ملک باز می‌شود.</p>
            </div>
          </div>

          <div className="property-qr-code-wrap">
            <img
              src={qrImageUrl}
              alt={`QR فایل ${property.title}`}
              className="property-qr-code"
              width={360}
              height={360}
            />
          </div>

          <div className="property-qr-target" dir="ltr">{qrTarget}</div>

          <div className="property-qr-actions">
            <button
              type="button"
              className="btn-gold"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!navigator.clipboard?.writeText) {
                  toast.error("کپی لینک در این مرورگر در دسترس نیست.");
                  return;
                }
                void navigator.clipboard.writeText(qrTarget)
                  .then(() => toast.success("لینک فایل کپی شد."))
                  .catch(() => toast.error("کپی لینک انجام نشد."));
              }}
            >
              کپی لینک فایل
            </button>
            <a
              className="btn-ghost"
              href={"https://api.qrserver.com/v1/create-qr-code/?size=1200x1200&margin=18&data=" + encodeURIComponent(qrTarget)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
            >
              باز کردن تصویر QR
            </a>
          </div>

          <small className="property-qr-note">
            مناسب برای چاپ روی کارت ویزیت، آگهی، شیشه دفتر و ارسال برای مشتری.
          </small>
        </section>
      </div>
    ) : null}
    </>
  );
}
