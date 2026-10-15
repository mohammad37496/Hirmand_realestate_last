import { useEffect, useMemo, useState } from "react";
import { ExternalLink, LocateFixed, MapPinned, RotateCcw } from "lucide-react";
import { listDivarNeighborhoodCatalog, type DivarNeighborhoodCatalogResult } from "@/lib/divar-neighborhoods";
import { normalizeDivarNeighborhoodName, type DivarNeighborhoodClientItem } from "@/lib/divar-neighborhood-geometry";

type Coordinates = {
  latitude: number | null;
  longitude: number | null;
};

type AdminLocationPickerProps = Coordinates & {
  neighborhood: string;
  onChange: (coordinates: Coordinates) => void;
};

const LOCATION_PICKER_CSS = `
.admin-location{display:flex;flex-direction:column;gap:16px}
.admin-location-panel{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,1.15fr);gap:16px;align-items:stretch}
.admin-location-controls{display:flex;flex-direction:column;gap:14px;min-width:0}
.admin-location-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 16px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(145deg,var(--card),var(--card-2))}
.admin-location-title{display:flex;align-items:flex-start;gap:10px;min-width:0}
.admin-location-title>svg{margin-top:3px;color:var(--brass-700);flex:0 0 auto}
.admin-location-title strong{display:block;font-size:.96rem;color:var(--fg);letter-spacing:-.01em}
.admin-location-title small{display:block;margin-top:5px;color:var(--muted);font-size:.77rem;line-height:1.9}
.admin-location-title small b{color:var(--fg)}
.admin-location-actions{display:flex;gap:8px;flex-wrap:wrap}
.admin-location-actions button,.admin-location-actions a{min-height:38px;padding:7px 12px;border-radius:11px;border:1px solid var(--line);background:var(--paper);color:var(--fg);font:inherit;font-size:.76rem;font-weight:800;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer;transition:border-color .18s ease,background .18s ease,transform .18s ease,box-shadow .18s ease}
.admin-location-actions button:hover:not(:disabled),.admin-location-actions a:hover{border-color:var(--brass-300);background:var(--brass-100);transform:translateY(-1px);box-shadow:0 5px 14px rgb(26 31 38 / 7%)}
.admin-location-actions button:focus-visible,.admin-location-actions a:focus-visible{outline:3px solid rgb(192 138 42 / 18%);outline-offset:2px}
.admin-location-actions button:disabled{opacity:.5;cursor:not-allowed;background:var(--card-2)}
.admin-location-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.admin-location-field{display:flex;flex-direction:column;gap:7px;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--card-2)}
.admin-location-field>span{color:var(--muted);font-size:.74rem;font-weight:800}
.admin-location-field>small{color:var(--subtle);font-size:.68rem;line-height:1.7}
.admin-location-field input{width:100%;min-height:46px;padding:9px 12px;border:1px solid var(--line);border-radius:11px;background:var(--card);color:var(--fg);outline:none;font:inherit;direction:ltr;text-align:left;font-variant-numeric:tabular-nums;transition:border-color .18s ease,box-shadow .18s ease,background .18s ease}
.admin-location-field input::placeholder{color:var(--subtle);opacity:.78}
.admin-location-field input:focus{border-color:var(--brass-600);box-shadow:0 0 0 3px rgb(192 138 42 / 12%)}
.admin-location-field input[aria-invalid="true"]{border-color:#c55b50;background:#fffafa;box-shadow:0 0 0 3px rgb(197 91 80 / 10%)}
.admin-location-validation{display:flex;align-items:center;gap:7px;min-height:18px;color:var(--subtle);font-size:.7rem;line-height:1.6}
.admin-location-validation.is-ok{color:#46735a}
.admin-location-validation.is-error{color:#a34c45}
.admin-location-status{display:flex;align-items:flex-start;gap:9px;margin:0;padding:11px 12px;border:1px solid rgb(192 138 42 / 22%);border-radius:13px;background:linear-gradient(135deg,var(--brass-100),var(--card-2));color:var(--brass-800);font-size:.75rem;line-height:1.9}
.admin-location-status-dot{width:8px;height:8px;border-radius:999px;background:var(--brass-600);margin-top:7px;flex:0 0 auto;box-shadow:0 0 0 4px rgb(192 138 42 / 11%)}
.admin-location-map-shell{display:flex;flex-direction:column;min-width:0;overflow:hidden;border:1px solid var(--line);border-radius:17px;background:var(--paper-2);box-shadow:0 8px 24px rgb(24 29 36 / 7%)}
.admin-location-map-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;border-bottom:1px solid var(--line);background:var(--card-2)}
.admin-location-map-head strong{color:var(--fg);font-size:.78rem}
.admin-location-map-head span{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;border:1px solid rgb(192 138 42 / 20%);background:var(--brass-100);color:var(--brass-800);font-size:.65rem;font-weight:800;white-space:nowrap}
.admin-location-map{min-height:330px}
.admin-location-map iframe{display:block;width:100%;height:330px;border:0}
.admin-location-map-empty{display:grid;place-items:center;min-height:330px;padding:24px;text-align:center;color:var(--muted);font-size:.82rem;line-height:1.9}
.admin-location-map-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:9px 12px;border-top:1px solid var(--line);color:var(--subtle);font-size:.68rem;line-height:1.7}
.admin-location-map-foot strong{color:var(--fg)}
.admin-location-foot{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;color:var(--subtle);font-size:.7rem;line-height:1.8;padding:0 2px}
.admin-location-foot strong{color:var(--fg)}
.admin-location-coordinates{display:inline-flex;align-items:center;direction:ltr;unicode-bidi:plaintext;padding:4px 8px;border:1px solid var(--line);border-radius:8px;background:var(--card-2);font-variant-numeric:tabular-nums;white-space:nowrap}
@media (max-width:900px){
  .admin-location-panel{grid-template-columns:1fr}
  .admin-location-map,.admin-location-map iframe,.admin-location-map-empty{min-height:290px;height:290px}
}
@media (max-width:600px){
  .admin-location-head{padding:13px}
  .admin-location-actions{width:100%}
  .admin-location-actions button,.admin-location-actions a{flex:1 1 auto}
  .admin-location-grid{grid-template-columns:1fr}
  .admin-location-map,.admin-location-map iframe,.admin-location-map-empty{min-height:250px;height:250px}
  .admin-location-foot{font-size:.68rem}
}
`;

function toEnglishDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function parseCoordinate(value: string, min: number, max: number) {
  const normalized = toEnglishDigits(value).trim().replace(/,/g, ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function osmEmbedUrl(
  latitude: number | null,
  longitude: number | null,
  exactDivarBbox?: DivarNeighborhoodClientItem["bbox"] | null,
) {
  if (exactDivarBbox) {
    const bbox = exactDivarBbox.join(",");
    const marker = latitude != null && longitude != null ? `&marker=${latitude}%2C${longitude}` : "";
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik${marker}`;
  }
  if (latitude == null || longitude == null) return null;
  // This view window is only for a manually placed property pin, not a neighborhood boundary.
  const delta = 0.002;
  const bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${latitude}%2C${longitude}`;
}

export function AdminLocationPicker({
  latitude,
  longitude,
  neighborhood,
  onChange,
}: AdminLocationPickerProps) {
  const [latitudeText, setLatitudeText] = useState(latitude == null ? "" : String(latitude));
  const [longitudeText, setLongitudeText] = useState(longitude == null ? "" : String(longitude));
  const [divarCatalog, setDivarCatalog] = useState<DivarNeighborhoodClientItem[]>([]);
  const [catalogSource, setCatalogSource] = useState<DivarNeighborhoodCatalogResult["source"] | "unavailable" | "loading">("loading");

  useEffect(() => {
    let active = true;
    listDivarNeighborhoodCatalog()
      .then((result) => {
        if (!active) return;
        setDivarCatalog(result.items);
        setCatalogSource(result.source);
      })
      .catch(() => {
        if (!active) return;
        setDivarCatalog([]);
        setCatalogSource("unavailable");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setLatitudeText(latitude == null ? "" : String(latitude));
  }, [latitude]);

  useEffect(() => {
    setLongitudeText(longitude == null ? "" : String(longitude));
  }, [longitude]);

  const suggested = useMemo(() => {
    const normalized = normalizeDivarNeighborhoodName(neighborhood);
    if (!normalized) return null;
    return divarCatalog.find((item) => normalizeDivarNeighborhoodName(item.name) === normalized) ?? null;
  }, [neighborhood, divarCatalog]);

  const previewLatitude = latitude ?? suggested?.defaultLocation.latitude ?? null;
  const previewLongitude = longitude ?? suggested?.defaultLocation.longitude ?? null;
  const hasCustomLocation = latitude != null && longitude != null;
  const previewMapUrl = hasCustomLocation
    ? osmEmbedUrl(previewLatitude, previewLongitude)
    : suggested
      ? osmEmbedUrl(previewLatitude, previewLongitude, suggested.bbox)
      : osmEmbedUrl(previewLatitude, previewLongitude);

  function setCoordinate(key: "latitude" | "longitude", raw: string) {
    if (key === "latitude") {
      setLatitudeText(raw);
      const next = parseCoordinate(raw, -90, 90);
      if (next != null || raw.trim() === "") onChange({ latitude: next, longitude });
      return;
    }

    setLongitudeText(raw);
    const next = parseCoordinate(raw, -180, 180);
    if (next != null || raw.trim() === "") onChange({ latitude, longitude: next });
  }

  function useNeighborhoodCenter() {
    if (!suggested?.defaultLocation) return;
    setLatitudeText(String(suggested.defaultLocation.latitude));
    setLongitudeText(String(suggested.defaultLocation.longitude));
    onChange({ latitude: suggested.defaultLocation.latitude, longitude: suggested.defaultLocation.longitude });
  }

  function clearLocation() {
    setLatitudeText("");
    setLongitudeText("");
    onChange({ latitude: null, longitude: null });
  }

  const latitudeValid = latitudeText.trim() === "" || parseCoordinate(latitudeText, -90, 90) != null;
  const longitudeValid = longitudeText.trim() === "" || parseCoordinate(longitudeText, -180, 180) != null;
  const bothCoordinatesValid =
    latitudeText.trim() !== "" &&
    longitudeText.trim() !== "" &&
    latitudeValid &&
    longitudeValid;

  function commitCoordinate(key: "latitude" | "longitude") {
    if (key === "latitude") {
      const next = parseCoordinate(latitudeText, -90, 90);
      onChange({ latitude: next, longitude });
      setLatitudeText(next == null ? "" : String(next));
      return;
    }

    const next = parseCoordinate(longitudeText, -180, 180);
    onChange({ latitude, longitude: next });
    setLongitudeText(next == null ? "" : String(next));
  }

  return (
    <div className="admin-location">
      <style>{LOCATION_PICKER_CSS}</style>

      <div className="admin-location-panel">
        <div className="admin-location-controls">
          <div className="admin-location-head">
            <div className="admin-location-title">
              <MapPinned size={19} aria-hidden="true" />
              <div>
                <strong>موقعیت تقریبی روی نقشه</strong>
                <small>
                  این نقطه فقط برای نمایش محدوده فایل استفاده می‌شود و
                  <b> آدرس دقیق شما را عمومی نمی‌کند.</b>
                </small>
              </div>
            </div>

            <div className="admin-location-actions">
              {suggested?.defaultLocation ? (
                <button type="button" onClick={useNeighborhoodCenter}>
                  <LocateFixed size={15} aria-hidden="true" />
                  مرکز محله
                </button>
              ) : null}
              <button type="button" onClick={clearLocation} disabled={!hasCustomLocation && !latitudeText && !longitudeText}>
                <RotateCcw size={15} aria-hidden="true" />
                پاک کردن
              </button>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${previewLatitude},${previewLongitude}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={15} aria-hidden="true" />
                باز کردن نقشه
              </a>
            </div>
          </div>

          <div className="admin-location-grid">
            <label className="admin-location-field">
              <span>عرض جغرافیایی (Latitude)</span>
              <input
                inputMode="decimal"
                value={latitudeText}
                onChange={(event) => setCoordinate("latitude", event.target.value)}
                onBlur={() => commitCoordinate("latitude")}
                placeholder={suggested?.defaultLocation ? String(suggested.defaultLocation.latitude) : ""}
                aria-label="عرض جغرافیایی موقعیت تقریبی"
                aria-invalid={!latitudeValid}
              />
              <small>{suggested?.defaultLocation ? `مرکز دیوار: ${String(suggested.defaultLocation.latitude)}` : "مختصات حدسی وارد نمی‌شود."}</small>
              <span className={`admin-location-validation ${latitudeValid ? "is-ok" : "is-error"}`} aria-live="polite">
                {latitudeValid ? "فرمت مختصات معتبر است" : "عدد واردشده برای عرض جغرافیایی معتبر نیست"}
              </span>
            </label>

            <label className="admin-location-field">
              <span>طول جغرافیایی (Longitude)</span>
              <input
                inputMode="decimal"
                value={longitudeText}
                onChange={(event) => setCoordinate("longitude", event.target.value)}
                onBlur={() => commitCoordinate("longitude")}
                placeholder={suggested?.defaultLocation ? String(suggested.defaultLocation.longitude) : ""}
                aria-label="طول جغرافیایی موقعیت تقریبی"
                aria-invalid={!longitudeValid}
              />
              <small>{suggested?.defaultLocation ? `مرکز دیوار: ${String(suggested.defaultLocation.longitude)}` : "مختصات حدسی وارد نمی‌شود."}</small>
              <span className={`admin-location-validation ${longitudeValid ? "is-ok" : "is-error"}`} aria-live="polite">
                {longitudeValid ? "فرمت مختصات معتبر است" : "عدد واردشده برای طول جغرافیایی معتبر نیست"}
              </span>
            </label>
          </div>

          <p className="admin-location-status" role="status">
            <span className="admin-location-status-dot" aria-hidden="true" />
            <span>
              {hasCustomLocation
                ? "موقعیت اختصاصی این فایل ثبت شده است و در سایت عمومی به‌صورت تقریبی نمایش داده می‌شود."
                : suggested
                  ? "مرکز و bbox از کاتالوگ دیوار گرفته شده‌اند. bbox کادر مستطیلی دیوار است، نه چندضلعی مرز محله."
                  : catalogSource === "loading"
                    ? "در حال دریافت فهرست اصلی محله‌های دیوار…"
                    : catalogSource === "unavailable"
                      ? "داده معتبر دیوار در دسترس نیست؛ هیچ مختصات یا محدوده‌ای حدس زده نمی‌شود."
                      : `محله «${neighborhood || "انتخاب‌نشده"}» در کاتالوگ فعلی دیوار پیدا نشد.`}
            </span>
          </p>
        </div>

        <div className="admin-location-map-shell">
          <div className="admin-location-map-head">
            <strong>پیش‌نمایش موقعیت</strong>
            <span>{hasCustomLocation ? "موقعیت ثبت‌شده" : suggested ? "کادر مکانی از دیوار" : "دادهٔ مکانی ناموجود"}</span>
          </div>
          <div className="admin-location-map">
            {previewMapUrl ? (
              <iframe
                title={`کادر مکانی دیوار یا نقطه ثبت‌شده ${neighborhood || "فایل"}`}
                src={previewMapUrl}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="admin-location-map-empty" role="status">
                نقشه تا زمان دریافت مختصات معتبر دیوار یا ثبت دستی نقطه نمایش داده نمی‌شود.
              </div>
            )}
          </div>
          <div className="admin-location-map-foot">
            <span>{suggested ? "کادر نمایش از bbox دیوار است؛ این نقشه چندضلعی جعلی تولید نمی‌کند." : "نقشه داخلی فقط برای کنترل موقعیت فایل در پنل مدیریت است."}</span>
            <strong>{bothCoordinatesValid ? "مختصات آماده ثبت" : "در انتظار مختصات کامل"}</strong>
          </div>
        </div>
      </div>

      <div className="admin-location-foot">
        <span>
          <strong>حریم خصوصی:</strong> نقطه را روی محدوده نزدیک ملک بگذار، نه روی پلاک یا ورودی دقیق ساختمان.
        </span>
        {hasCustomLocation ? (
          <span className="admin-location-coordinates">{latitude} · {longitude}</span>
        ) : null}
      </div>
    </div>
  );
}
