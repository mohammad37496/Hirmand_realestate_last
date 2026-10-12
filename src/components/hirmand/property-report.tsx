import { Clipboard, Download, FileText, Printer, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Property } from "@/lib/properties";
import { SITE } from "@/lib/site";
import { propertyPath } from "@/lib/property-path";
import "@/property-report.css";

function normalize(value: string | null | undefined) {
  return value?.trim() || "";
}

function money(value: string | null | undefined) {
  const raw = normalize(value);
  const parsed = Number(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed.toLocaleString("fa-IR") + " تومان" : "تماس بگیرید";
}

function txLabel(property: Property) {
  if (property.transactionType === "sell") return "فروش";
  if (property.transactionType === "buy") return "خرید";
  if (property.transactionType === "rent") return "اجاره";
  return "رهن";
}

function typeLabel(property: Property) {
  if (property.propertyType === "apartment") return "آپارتمان";
  if (property.propertyType === "villa") return "ویلا";
  if (property.propertyType === "office") return "اداری";
  if (property.propertyType === "heritage") return "قدیمی / کلنگی";
  if (property.propertyType === "land") return "زمین";
  return "تجاری";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildReportHtml(property: Property, url: string) {
  const specs = [
    ["نوع معامله", txLabel(property)],
    ["نوع ملک", typeLabel(property)],
    ["محله", property.neighborhood],
    ["متراژ", property.areaM2 ? property.areaM2.toLocaleString("fa-IR") + " متر" : "—"],
    ["خواب", property.bedrooms != null ? property.bedrooms.toLocaleString("fa-IR") : "—"],
    ["سرویس", property.bathrooms != null ? property.bathrooms.toLocaleString("fa-IR") : "—"],
    ["طبقه", property.floorLabel === "suite" ? "سوئیت" : property.floor != null ? property.floor.toLocaleString("fa-IR") : "—"],
  ];
  const amenities = [
    property.parking ? "پارکینگ" : "",
    property.elevator ? "آسانسور" : "",
    property.storage ? "انباری" : "",
    property.convertible ? "قابل تبدیل" : "",
    ...property.otherAmenities,
  ].filter(Boolean);

  const specRows = specs.map(([label, value]) => '<div class="spec"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>').join("");
  const amenitiesHtml = amenities.length ? '<div class="chips">' + amenities.map((item) => '<span>' + escapeHtml(item) + '</span>').join("") + '</div>' : '<p class="muted">امکانات تکمیلی ثبت نشده است.</p>';
  const firstImage = property.images[0] && /^https:\/\//i.test(property.images[0]) ? property.images[0] : "";
  const title = escapeHtml(property.title);
  const code = escapeHtml(property.id.slice(-6).toUpperCase());
  const urlText = escapeHtml(url);
  const neighborhood = escapeHtml(property.neighborhood);
  const description = escapeHtml(normalize(property.description));
  const contactName = escapeHtml(normalize(property.contactName));
  const contactPhone = escapeHtml(normalize(property.contactPhone));
  const tx = escapeHtml(txLabel(property));
  const type = escapeHtml(typeLabel(property));
  return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>گزارش فایل - ' + title + '</title><style>' +
    'body{font-family:Tahoma,Arial,sans-serif;background:#f4f0e9;color:#182331;margin:0;padding:30px;line-height:1.9}.sheet{max-width:900px;margin:auto;background:#fffdf9;border:1px solid #d9d0c3;border-radius:24px;padding:28px}.brand{color:#8a5e14;font-weight:800;letter-spacing:.02em}.top{display:flex;justify-content:space-between;gap:20px}.title{font-size:25px;color:#0b1a2b;margin:7px 0}.code{font-family:monospace;color:#8a5e14}.image{width:100%;max-height:380px;object-fit:cover;border-radius:18px;margin:18px 0;background:#e9e1d7}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.spec{padding:11px;border:1px solid #e5ddd3;border-radius:13px;background:#f7f4ee}.spec span{display:block;color:#6b7480;font-size:11px}.spec strong{display:block;color:#0b1a2b;font-size:13px}.price{font-size:21px;color:#8a5e14;font-weight:800;margin:18px 0}.chips{display:flex;flex-wrap:wrap;gap:7px}.chips span{padding:5px 9px;border-radius:999px;background:#f1eae0;font-size:11px}.muted{color:#6d7782;font-size:12px}.desc{white-space:pre-wrap}.footer{margin-top:22px;padding-top:14px;border-top:1px solid #e5ddd3;color:#69737e;font-size:11px}@media(max-width:700px){body{padding:12px}.sheet{padding:16px}.grid{grid-template-columns:1fr 1fr}.top{flex-direction:column}}@media print{body{background:#fff;padding:0}.sheet{border:0;box-shadow:none}}' +
    '</style></head><body><main class="sheet"><div class="top"><div><div class="brand">' + SITE.nameFa + '</div><h1 class="title">' + property.title + '</h1><div class="code">کد فایل: ' + property.id.slice(-6).toUpperCase() + '</div></div><div class="code">' + txLabel(property) + ' · ' + typeLabel(property) + '</div></div>' +
    (firstImage ? '<img class="image" src="' + firstImage + '" alt="تصویر فایل">' : '') +
    '<div class="price">' + escapeHtml(property.transactionType === "rent" ? "رهن: " + money(property.deposit) + " · اجاره: " + money(property.rent) : property.transactionType === "mortgage" ? "رهن: " + money(property.deposit) : "قیمت: " + money(property.price)) + '</div>' +
    '<div class="grid">' + specRows + '</div><div class="muted">محله: ' + neighborhood + '</div><h2>امکانات</h2>' + amenitiesHtml + '<h2>توضیحات</h2><p class="desc">' + description + '</p>' +
    '<div class="footer">مشاور: ' + contactName + ' · ' + contactPhone + '<br>لینک فایل: ' + urlText + '<br>' + escapeHtml(SITE.nameFa) + '</div></main></body></html>';
}

export function PropertyReport({ property }: { property: Property }) {
  const [status, setStatus] = useState("");
  const url = useMemo(() => {
    if (typeof window === "undefined") return propertyPath(property);
    return new URL(propertyPath(property), window.location.origin).toString();
  }, [property]);

  function downloadReport() {
    const html = buildReportHtml(property, url);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "hirmand-property-report-" + property.id.slice(-6).toUpperCase() + ".html";
    link.click();
    URL.revokeObjectURL(href);
    setStatus("گزارش فایل ساخته شد؛ می‌توانید آن را باز کنید و PDF بگیرید.");
  }

  function printReport() {
    const html = buildReportHtml(property, url);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const popup = window.open(href, "_blank", "noopener,noreferrer");
    if (!popup) {
      setStatus("پنجره چاپ توسط مرورگر مسدود شد.");
      URL.revokeObjectURL(href);
      return;
    }
    popup.addEventListener("load", () => {
      popup.focus();
      popup.print();
      window.setTimeout(() => URL.revokeObjectURL(href), 1500);
    }, { once: true });
    setStatus("پنجره چاپ گزارش باز شد.");
  }

  async function shareReport() {
    try {
      if (navigator.share) {
        await navigator.share({ title: property.title, text: "گزارش فایل در هیرمند", url });
        setStatus("لینک گزارش فایل با موفقیت برای اشتراک آماده شد.");
      } else {
        await navigator.clipboard.writeText(url);
        setStatus("لینک فایل کپی شد.");
      }
    } catch {
      // User cancellation is not an error worth surfacing.
    }
  }

  async function copyReportText() {
    const text = [
      property.title,
      "کد فایل: " + property.id.slice(-6).toUpperCase(),
      "نوع معامله: " + txLabel(property),
      "محله: " + property.neighborhood,
      property.areaM2 ? "متراژ: " + property.areaM2.toLocaleString("fa-IR") + " متر" : "",
      property.price ? "قیمت: " + money(property.price) : "",
      property.deposit ? "رهن: " + money(property.deposit) : "",
      property.rent ? "اجاره: " + money(property.rent) : "",
      "لینک: " + url,
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setStatus("خلاصه گزارش کپی شد.");
    } catch {
      setStatus("کپی خلاصه گزارش در این مرورگر در دسترس نیست.");
    }
  }

  return (
    <section className="property-report" aria-labelledby="property-report-heading">
      <header className="property-report-head">
        <div>
          <span className="kicker"><FileText size={14} /> گزارش فایل</span>
          <h2 id="property-report-heading">گزارش یک‌صفحه‌ای برای ذخیره یا ارسال</h2>
          <p>اطلاعات عمومی همین فایل در قالب مرتب برای چاپ، PDF یا ارسال آماده می‌شود.</p>
        </div>
      </header>
      <div className="property-report-actions">
        <button type="button" className="btn-gold" onClick={downloadReport}><Download size={15} /> دانلود گزارش</button>
        <button type="button" className="btn-ghost" onClick={printReport}><Printer size={15} /> چاپ / PDF</button>
        <button type="button" className="btn-ghost" onClick={() => void shareReport()}><Share2 size={15} /> اشتراک</button>
        <button type="button" className="btn-ghost" onClick={() => void copyReportText()}><Clipboard size={15} /> کپی خلاصه</button>
      </div>
      {status ? <p className="property-report-status" role="status">{status}</p> : null}
    </section>
  );
}
