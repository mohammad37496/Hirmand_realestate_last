import { useEffect, useState } from "react";
import {
  BedDouble,
  DoorOpen,
  Expand,
  FileImage,
  Info,
  Maximize2,
  Ruler,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Property } from "@/lib/properties";
import "@/property-detail-signature.css";

function isInternalMediaUrl(value: string) {
  return /^\/(?:api|uploads|media|images)\//i.test(value);
}

export function PropertyFloorPlan({ property }: { property: Property }) {
  const floorPlanUrl = property.floorPlanUrl?.trim() ?? "";
  const hasRealPlan = Boolean(floorPlanUrl);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!lightboxOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxOpen]);

  function openPlan() {
    setZoom(1);
    setLightboxOpen(true);
  }

  function changeZoom(delta: number) {
    setZoom((value) => Math.min(3, Math.max(1, Number((value + delta).toFixed(2)))));
  }

  return (
    <section
      id="property-floor-plan"
      className={"property-new-feature property-floor-plan" + (hasRealPlan ? " has-real-plan" : " property-floor-plan--unavailable")}
      aria-labelledby="property-floor-plan-title"
    >
      <header className="property-new-feature-head">
        <div>
          <span className="kicker">
            {hasRealPlan ? <FileImage size={14} aria-hidden="true" /> : <Info size={14} aria-hidden="true" />}
            {hasRealPlan ? "پلان ملک" : "اطلاعات پلان"}
          </span>
          <h2 id="property-floor-plan-title">{hasRealPlan ? "پلان و نقشه ملک" : "پلان معماری ملک"}</h2>
          <p>
            {hasRealPlan
              ? "پلان واقعی ثبت‌شده برای این فایل را مشاهده کنید. برای بزرگ‌نمایی روی تصویر کلیک کنید."
              : "برای این فایل هنوز پلان معماری در سامانه ثبت نشده است؛ اینجا هیچ چیدمان ساختگی یا تقریبی به‌عنوان پلان نمایش داده نمی‌شود."}
          </p>
        </div>
        <span className={"property-new-feature-badge" + (hasRealPlan ? " is-real" : "")}>
          {hasRealPlan ? "پلان واقعی" : "ثبت نشده"}
        </span>
      </header>

      {property.areaM2 != null || property.bedrooms != null || property.floor != null || property.floorLabel === "suite" ? (
        <div className="property-floor-plan-meta">
          {property.areaM2 != null ? (
            <span><Ruler size={14} aria-hidden="true" /> {property.areaM2.toLocaleString("fa-IR")} متر</span>
          ) : null}
          {property.bedrooms != null ? (
            <span><BedDouble size={14} aria-hidden="true" /> {property.bedrooms.toLocaleString("fa-IR")} خواب</span>
          ) : null}
          {property.floor != null || property.floorLabel === "suite" ? (
            <span>
              <DoorOpen size={14} aria-hidden="true" />
              {property.floorLabel === "suite" ? "سوئیت" : "طبقه " + property.floor!.toLocaleString("fa-IR")}
            </span>
          ) : null}
        </div>
      ) : null}

      {hasRealPlan ? (
        <div className="property-floor-plan-real">
          <button
            type="button"
            className="property-floor-plan-real-image-button"
            onClick={openPlan}
            aria-label="مشاهده پلان واقعی در اندازه بزرگ"
          >
            <img
              src={floorPlanUrl}
              alt={"پلان واقعی " + property.title}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
            <span className="property-floor-plan-real-overlay">
              <Maximize2 size={18} aria-hidden="true" />
              مشاهده تمام‌صفحه
            </span>
          </button>
          <div className="property-floor-plan-real-footer">
            <span>
              <Info size={15} aria-hidden="true" />
              تصویر پلان ثبت‌شده برای این فایل در سامانه هیرمند.
            </span>
            <button type="button" className="btn-ghost" onClick={openPlan}>
              <Expand size={15} aria-hidden="true" />
              بزرگ‌نمایی
            </button>
          </div>
        </div>
      ) : (
        <div className="property-floor-plan-unavailable" role="note">
          <span className="property-floor-plan-unavailable-icon">
            <Info size={19} aria-hidden="true" />
          </span>
          <div>
            <strong>پلان معماری رسمی برای این فایل ثبت نشده است.</strong>
            <p>
              برای حفظ دقت اطلاعات، سیستم از تولید «نمای شماتیک» خودکار خودداری می‌کند. در صورت ثبت پلان واقعی توسط تیم هیرمند، تصویر آن در همین بخش نمایش داده خواهد شد.
            </p>
          </div>
        </div>
      )}

      {lightboxOpen && hasRealPlan ? (
        <div
          className="property-floor-plan-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="نمایش پلان واقعی"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            className="property-floor-plan-lightbox-close"
            onClick={() => setLightboxOpen(false)}
            aria-label="بستن پلان"
          >
            <X size={20} aria-hidden="true" />
          </button>

          <div
            className="property-floor-plan-lightbox-stage"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={floorPlanUrl}
              alt={"پلان واقعی " + property.title}
              style={{ transform: "scale(" + zoom + ")" }}
            />
          </div>

          <div
            className="property-floor-plan-lightbox-controls"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => changeZoom(-0.25)}
              disabled={zoom <= 1}
              aria-label="کوچک‌نمایی"
            >
              <ZoomOut size={17} aria-hidden="true" />
            </button>
            <span>{Math.round(zoom * 100).toLocaleString("fa-IR")}%</span>
            <button
              type="button"
              onClick={() => changeZoom(0.25)}
              disabled={zoom >= 3}
              aria-label="بزرگ‌نمایی"
            >
              <ZoomIn size={17} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setZoom(1)} aria-label="بازنشانی اندازه">
              <RotateCcw size={16} aria-hidden="true" />
            </button>
          </div>

          <p className="property-floor-plan-lightbox-note">
            {isInternalMediaUrl(floorPlanUrl) ? "پلان واقعی ذخیره‌شده در سامانه هیرمند" : "پلان ثبت‌شده برای این فایل"}
          </p>
        </div>
      ) : null}
    </section>
  );
}
