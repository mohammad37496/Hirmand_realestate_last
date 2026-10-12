import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileSearch, Hash, Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { getPublishedPropertyByFileCode } from "@/lib/properties";
import { propertyPath } from "@/lib/property-path";
import { SITE } from "@/lib/site";
import "@/file-code.css";

function normalizeCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-F0-9]/g, "")
    .slice(0, 6);
}

export const Route = createFileRoute("/file-code")({
  head: () => ({
    meta: [
      { title: `یافتن فایل با کد | ${SITE.nameFa}` },
      {
        name: "description",
        content: "یافتن سریع فایل ملکی هیرمند با وارد کردن کد ۶ رقمی فایل.",
      },
    ],
  }),
  component: FileCodePage,
});

function FileCodePage() {
  const [code, setCode] = useState("");
  const [property, setProperty] = useState<Awaited<ReturnType<typeof getPublishedPropertyByFileCode>>>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("code");
    if (!param) return;
    const normalized = normalizeCode(param);
    setCode(normalized);
    if (normalized.length === 6) void lookup(normalized);
  }, []);

  async function lookup(value = code) {
    const normalized = normalizeCode(value);
    setCode(normalized);
    setSearched(true);
    setProperty(null);
    if (normalized.length !== 6) return;

    setLoading(true);
    try {
      setProperty(await getPublishedPropertyByFileCode({ data: { code: normalized.toLowerCase() } }));
    } catch {
      setProperty(null);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void lookup();
  }

  return (
    <main className="file-code-page">
      <header className="file-code-header">
        <Link to="/" className="file-code-back"><ArrowLeft size={16} /> بازگشت به هیرمند</Link>
        <div className="file-code-brand">
          <span className="file-code-brand-icon"><Hash size={22} /></span>
          <span>
            <small>HIRMAND REAL ESTATE</small>
            <strong>یافتن سریع فایل</strong>
          </span>
        </div>
      </header>

      <section className="file-code-shell">
        <div className="file-code-hero">
          <span className="kicker">کد فایل</span>
          <h1>کد ۶ رقمی فایل را وارد کنید.</h1>
          <p>
            کد فایل روی صفحه ملک، کارت معرفی و آگهی هیرمند نمایش داده می‌شود. با وارد کردن آن مستقیماً به صفحه همان ملک می‌رسید.
          </p>
          <form className="file-code-form" onSubmit={submit}>
            <label className="field">
              <span>کد فایل</span>
              <input
                value={code}
                onChange={(event) => setCode(normalizeCode(event.target.value))}
                inputMode="text"
                dir="ltr"
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="A1B2C3"
                aria-label="کد ۶ رقمی فایل"
              />
            </label>
            <button type="submit" className="btn-gold" disabled={loading || code.length !== 6}>
              <Search size={17} />
              {loading ? "در حال جستجو..." : "یافتن فایل"}
            </button>
          </form>
          <div className="file-code-examples">
            <span><FileSearch size={15} /> مناسب برای کدهای چاپ‌شده روی آگهی</span>
            <span><Hash size={15} /> جستجو بدون نیاز به عنوان ملک</span>
          </div>
        </div>

        {searched ? (
          property ? (
            <article className="file-code-result">
              <div className="file-code-result-icon"><FileSearch size={24} /></div>
              <div>
                <span className="kicker">فایل پیدا شد</span>
                <h2>{property.title}</h2>
                <p>{property.neighborhood} · {property.areaM2 != null ? property.areaM2.toLocaleString("fa-IR") + " متر" : "متراژ ثبت نشده"}</p>
              </div>
              <Link to="/properties/$slug" params={{ slug: property.slug }} className="btn-gold">مشاهده جزئیات</Link>
            </article>
          ) : (
            <section className="file-code-not-found" role="status">
              <FileSearch size={26} />
              <strong>فایلی با کد «{code || "—"}» پیدا نشد.</strong>
              <p>کد را دوباره بررسی کنید یا از مشاور هیرمند بخواهید لینک مستقیم فایل را برایتان ارسال کند.</p>
            </section>
          )
        ) : (
          <section className="file-code-tip">
            <strong>کد فایل را از کجا پیدا کنم؟</strong>
            <p>در صفحه جزئیات هر ملک، کنار عنوان فایل، عبارت «کد فایل» نمایش داده می‌شود.</p>
          </section>
        )}

        <Link to="/properties" className="file-code-all-link">مشاهده همه فایل‌های منتشرشده ←</Link>
      </section>
    </main>
  );
}
