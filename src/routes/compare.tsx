import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftRight, Download, Heart, Share2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PropertyCard } from "@/components/hirmand/property-showcase";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { listPublishedPropertiesBySlugs, type Property } from "@/lib/properties";
import { SITE } from "@/lib/site";
import { formatToman } from "@/lib/money";
import { propertyPath } from "@/lib/property-path";
import "@/compare-export.css";

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

const COMPARE_KEY = "hirmand-compare-properties";
const MAX_COMPARE = 3;

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

function readSharedCompare(): string[] {
  try {
    const value = new URLSearchParams(window.location.search).get("share");
    if (!value) return [];
    return Array.from(new Set(
      value.split(",").filter((item) => item.trim().length > 0).map((item) => item.trim()),
    )).slice(0, MAX_COMPARE);
  } catch {
    return [];
  }
}

async function shareCompare(slugs: string[]) {
  const safe = Array.from(new Set(slugs.filter(Boolean))).slice(0, MAX_COMPARE);
  if (safe.length < 2) return;
  const url = new URL("/compare", window.location.origin);
  url.searchParams.set("share", safe.join(","));
  const shareUrl = url.toString();
  try {
    if (navigator.share) {
      await navigator.share({
        title: "مقایسه فایل‌های هیرمند",
        text: "مقایسه چند فایل منتخب در املاک هیرمند",
        url: shareUrl,
      });
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("لینک مقایسه کپی شد.");
      return;
    }
    window.prompt("لینک مقایسه:", shareUrl);
  } catch {
    // Sharing can be cancelled by the visitor.
  }
}

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: `مقایسه فایل‌ها | ${SITE.nameFa}` },
      { name: "description", content: "مقایسه هم‌زمان ویژگی‌ها و قیمت فایل‌های ملکی هیرمند." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ComparePage,
});

const PROPERTY_TYPE_LABEL: Record<Property["propertyType"], string> = {
  apartment: "آپارتمان",
  villa: "ویلا و باغ",
  office: "اداری",
  heritage: "خانه اصیل",
  land: "زمین",
  commercial: "تجاری",
};

function valueMoney(value: string | null) {
  if (!value) return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? formatToman(parsed) + " تومان" : value;
}
function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "").replace(/\r?\n|\r/g, " ").trim();
  return /[",]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function exportCompareCsv(properties: Property[]) {
  const headers = ["عنوان", "کد/شناسه", "نوع معامله", "نوع ملک", "محله", "متراژ", "خواب", "طبقه", "پارکینگ", "آسانسور", "انباری", "قیمت هر متر", "قیمت فروش", "رهن", "اجاره", "لینک"];
  const rows = properties.map((p) => [
    p.title,
    p.slug || p.id,
    p.transactionType === "sell" ? "فروش" : p.transactionType === "buy" ? "خرید" : p.transactionType === "rent" ? "اجاره" : "رهن",
    PROPERTY_TYPE_LABEL[p.propertyType] ?? p.propertyType,
    p.neighborhood,
    p.areaM2 ?? "",
    p.bedrooms ?? "",
    p.floorLabel === "suite" ? "سوئیت" : p.floor ?? "",
    p.parking ? "دارد" : "ندارد",
    p.elevator ? "دارد" : "ندارد",
    p.storage ? "دارد" : "ندارد",
    valuePerM2(p),
    valueMoney(p.price),
    valueMoney(p.deposit),
    valueMoney(p.rent),
    typeof window !== "undefined" ? new URL(propertyPath(p), window.location.origin).toString() : propertyPath(p),
  ]);
  const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hirmand-compare-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast.success("خروجی مقایسه آماده شد.");
}

function valuePerM2(property: Property) {
  if ((property.transactionType !== "buy" && property.transactionType !== "sell") || !property.price || !property.areaM2 || property.areaM2 <= 0) return "—";
  const parsed = Number(property.price);
  return Number.isFinite(parsed) && parsed > 0 ? formatToman(Math.round(parsed / property.areaM2)) + " تومان" : "—";
}

function ComparePage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  function removeFromCompare(slug: string) {
    const next = readCompare().filter((item) => item !== slug);
    try {
      localStorage.setItem(COMPARE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage failures.
    }
    setProperties((current) => current.filter((property) => property.slug !== slug));
  }

  useEffect(() => {
    let cancelled = false;
    const shared = readSharedCompare();
    const slugs = Array.from(new Set([...shared, ...readCompare()])).slice(0, MAX_COMPARE);
    if (shared.length) {
      try {
        localStorage.setItem(COMPARE_KEY, JSON.stringify(slugs));
      } catch {
        // Ignore storage failures.
      }
    }
    if (!slugs.length) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    void listPublishedPropertiesBySlugs({ data: { slugs } })
      .then((rows) => {
        if (cancelled) return;
        setProperties(rows);
        const valid = new Set(rows.map((property) => property.slug));
        const retained = slugs.filter((slug) => valid.has(slug));
        if (retained.length !== slugs.length) {
          try {
            localStorage.setItem(COMPARE_KEY, JSON.stringify(retained));
          } catch {
            // Ignore storage failures; the fetched rows remain usable.
          }
        }
      })
      .catch(() => {
        if (!cancelled) setProperties([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function clearCompare() {
    try {
      localStorage.removeItem(COMPARE_KEY);
    } catch {
      // Ignore storage failures.
    }
    setProperties([]);
  }

  return (
    <SiteChrome className="property-detail-shell">
      <main className="compare-page">
        <header className="favorites-head">
          <div>
            <span className="kicker">انتخاب هوشمند</span>
            <h1>مقایسه فایل‌ها</h1>
            <p>تا ۳ فایل را کنار هم ببینید تا تفاوت قیمت، متراژ، امکانات و موقعیت را سریع‌تر بررسی کنید.</p>
          </div>
          <ArrowLeftRight size={30} />
        </header>

        {loading ? (
          <section className="property-empty">
            <strong>در حال آماده‌سازی مقایسه…</strong>
          </section>
        ) : properties.length < 2 ? (
          <section className="property-empty">
            <ArrowLeftRight size={28} />
            <strong>برای مقایسه حداقل ۲ فایل انتخاب کنید.</strong>
            <p>در صفحه فایل‌ها یا روی کارت ملک، دکمه «مقایسه» را بزنید.</p>
            <div className="properties-empty-actions">
              <Link to="/properties" className="btn-gold">مشاهده فایل‌ها</Link>
              {properties.length ? <a href={propertyPath(properties[0]!)} className="btn-ghost">مشاهده فایل انتخاب‌شده</a> : null}
            </div>
          </section>
        ) : (
          <>
            <div className="compare-toolbar">
              <span>{properties.length.toLocaleString("fa-IR")} فایل انتخاب شده</span>
              <div className="compare-toolbar-actions">
                <button type="button" className="properties-reset-btn" onClick={() => exportCompareCsv(properties)}>
                  <Download size={14} /> خروجی CSV
                </button>
                <button type="button" className="properties-reset-btn" onClick={() => void shareCompare(properties.map((property) => property.slug))}>
                  <Share2 size={14} /> اشتراک مقایسه
                </button>
                <button type="button" className="properties-reset-btn" onClick={clearCompare}>
                  <Trash2 size={14} /> پاک‌کردن مقایسه
                </button>
              </div>
            </div>

            <div className="compare-grid">
              {properties.map((property) => (
                <div key={property.id} className="compare-card">
                  <PropertyCard property={property} />
                </div>
              ))}
            </div>

            <div className="compare-table-wrap">
              <table className="compare-table">
                <tbody>
                  <tr>
                    <th>نوع معامله</th>
                    {properties.map((p) => <td key={p.id}>{p.transactionType === "sell" ? "فروش" : p.transactionType === "buy" ? "خرید" : p.transactionType === "rent" ? "اجاره" : "رهن"}</td>)}
                  </tr>
                  <tr>
                    <th>نوع ملک</th>
                    {properties.map((p) => <td key={p.id}>{PROPERTY_TYPE_LABEL[p.propertyType] ?? p.propertyType}</td>)}
                  </tr>
                  <tr>
                    <th>محله</th>
                    {properties.map((p) => <td key={p.id}>{p.neighborhood}</td>)}
                  </tr>
                  <tr>
                    <th>متراژ</th>
                    {properties.map((p) => <td key={p.id}>{p.areaM2 != null ? p.areaM2.toLocaleString("fa-IR") + " متر" : "—"}</td>)}
                  </tr>
                  <tr>
                    <th>خواب</th>
                    {properties.map((p) => <td key={p.id}>{p.bedrooms != null ? p.bedrooms.toLocaleString("fa-IR") : "—"}</td>)}
                  </tr>
                  <tr>
                    <th>طبقه</th>
                    {properties.map((p) => (
                      <td key={p.id}>
                        {p.floorLabel === "suite" ? "سوئیت" : p.floor != null ? p.floor.toLocaleString("fa-IR") : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>موقعیت ملک</th>
                    {properties.map((p) => <td key={p.id}>{p.orientation ? PROPERTY_ORIENTATION_LABELS[p.orientation] : "—"}</td>)}
                  </tr>
                  <tr>
                    <th>قابل تبدیل</th>
                    {properties.map((p) => <td key={p.id}>{p.convertible ? "بله" : "خیر"}</td>)}
                  </tr>
                  <tr>
                    <th>پارکینگ</th>
                    {properties.map((p) => <td key={p.id}>{p.parking ? "دارد" : "ندارد"}</td>)}
                  </tr>
                  <tr>
                    <th>آسانسور</th>
                    {properties.map((p) => <td key={p.id}>{p.elevator ? "دارد" : "ندارد"}</td>)}
                  </tr>
                  <tr>
                    <th>انباری</th>
                    {properties.map((p) => <td key={p.id}>{p.storage ? "دارد" : "ندارد"}</td>)}
                  </tr>
                  <tr>
                    <th>رنگ‌آمیزی</th>
                    {properties.map((p) => <td key={p.id}>{p.painted ? "دارد" : "ندارد"}</td>)}
                  </tr>
                  <tr>
                    <th>کاغذ دیواری</th>
                    {properties.map((p) => <td key={p.id}>{p.wallpaper ? "دارد" : "ندارد"}</td>)}
                  </tr>
                  <tr>
                    <th>انباری</th>
                    {properties.map((p) => <td key={p.id}>{p.storage ? "دارد" : "ندارد"}</td>)}
                  </tr>
                  <tr>
                    <th>قیمت هر متر</th>
                    {properties.map((p) => <td key={p.id}>{valuePerM2(p)}</td>)}
                  </tr>
                  <tr>
                    <th>قیمت فروش</th>
                    {properties.map((p) => <td key={p.id}>{valueMoney(p.price)}</td>)}
                  </tr>
                  <tr>
                    <th>رهن</th>
                    {properties.map((p) => <td key={p.id}>{valueMoney(p.deposit)}</td>)}
                  </tr>
                  <tr>
                    <th>اجاره</th>
                    {properties.map((p) => <td key={p.id}>{valueMoney(p.rent)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="compare-actions">
              {properties.map((property) => (
                <div key={property.id}>
                  <strong>{property.title}</strong>
                  <button
                    type="button"
                    className="properties-reset-btn"
                    onClick={() => removeFromCompare(property.slug)}
                  >
                    <Trash2 size={14} /> حذف از مقایسه
                  </button>
                </div>
              ))}
            </div>

            <div className="property-empty" style={{ marginTop: 24 }}>
              <Heart size={22} />
              <strong>برای دیدن گزینه‌های بیشتر، به فهرست فایل‌ها برگردید.</strong>
              <Link to="/properties" className="btn-gold">جستجوی فایل‌های بیشتر</Link>
            </div>
          </>
        )}
      </main>
    </SiteChrome>
  );
}
