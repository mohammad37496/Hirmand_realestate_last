import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpLeft, BookOpen, CheckCircle2, Search, Share2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { getGuideAccordionContent } from "@/lib/guide-accordion.mjs";
import { SITE } from "@/lib/site";
import { getPublicGuides, type GuideContent } from "@/lib/site-content";
import "@/guides.css";

type Guide = GuideContent;

export const Route = createFileRoute("/guides/")({
  loader: async () => ({ guides: await getPublicGuides() }),
  head: () => {
    const title = "راهنمای خرید، فروش و اجاره ملک | " + SITE.nameFa;
    const description = "راهنمای کاربردی هیرمند برای خرید، فروش، رهن و اجاره ملک و آماده‌سازی برای بازدید و مقایسه فایل‌ها.";
    return { meta: [{ title }, { name: "description", content: description }, { name: "robots", content: "index, follow" }], links: [{ rel: "canonical", href: SITE.url + "/guides" }] };
  },
  component: GuidesPage,
});

function GuidesPage() {
  const { guides } = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("همه");
  const [openId, setOpenId] = useState("");
  useEffect(() => {
    const guideId = new URLSearchParams(window.location.search).get("guide");
    if (guideId && guides.some((item) => item.id === guideId)) setOpenId(guideId);
  }, [guides]);
  useEffect(() => {
    if (!openId && guides[0]) setOpenId(guides[0].id);
  }, [guides, openId]);
  const categories = useMemo(() => ["همه", ...Array.from(new Set(guides.map((item) => item.category)))], [guides]);
  const visible = useMemo(() => {
    const q = query.trim();
    return guides.filter((item) => {
      const matchesCategory = category === "همه" || item.category === category;
      const sectionText = (item.sections ?? []).flatMap((section) => [section.heading, ...section.paragraphs]);
      const haystack = [item.title, item.summary, item.category, ...item.points, ...sectionText].join(" ");
      return matchesCategory && (!q || haystack.includes(q));
    });
  }, [guides, category, query]);

  async function shareGuide(guide: Guide) {
    const url = new URL("/guides/" + encodeURIComponent(guide.id), window.location.origin).toString();
    try {
      if (navigator.share) await navigator.share({ title: guide.title, text: guide.summary, url });
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); toast.success("لینک راهنما کپی شد."); }
      else window.prompt("لینک راهنما:", url);
    } catch {
      // Sharing can be cancelled by the visitor.
    }
  }

  const activeCategoryCount = category === "همه" ? guides.length : guides.filter((item) => item.category === category).length;

  return (
    <SiteChrome>
      <main className="guides-page">
        <nav className="guides-breadcrumb" aria-label="مسیر صفحه"><a href="/">صفحه اصلی</a><ArrowLeft size={13} aria-hidden="true" /><span>راهنمای ملکی</span></nav>

        <header className="guides-hero">
          <div className="guides-hero-content">
            <span className="guides-eyebrow"><Sparkles size={14} aria-hidden="true" /> دانش و تجربه هیرمند</span>
            <h1>با آگاهی بیشتر،<br /><span>انتخاب مطمئن‌تری</span> داشته باشید.</h1>
            <p>راهنمایی‌های کاربردی خرید، فروش، رهن و اجاره؛ برای اینکه جزئیات مهم را بشناسید و با دیدی روشن‌تر تصمیم بگیرید.</p>
            <div className="guides-hero-meta"><span><BookOpen size={16} aria-hidden="true" /> {guides.length.toLocaleString("fa-IR")} راهنمای کاربردی</span><i aria-hidden="true" /><span>مطالعه آسان و مرحله‌به‌مرحله</span></div>
          </div>
          <div className="guides-hero-art" aria-hidden="true">
            <div className="guides-art-orbit guides-art-orbit-one" />
            <div className="guides-art-orbit guides-art-orbit-two" />
            <div className="guides-art-card"><span className="guides-art-card-top"><BookOpen size={19} /><i /></span><strong>راهنمای تصمیم آگاهانه</strong><span className="guides-art-line guides-art-line-long" /><span className="guides-art-line" /><span className="guides-art-check"><CheckCircle2 size={15} /> نکته‌های کلیدی، یک‌جا</span></div>
            <span className="guides-art-seal"><Sparkles size={18} /></span>
          </div>
        </header>

        <section className="guides-discovery" aria-label="جستجو و دسته‌بندی راهنماها">
          <div className="guides-discovery-heading"><div><span className="guides-section-kicker">کتابخانه راهنما</span><h2>از کجا شروع کنیم؟</h2></div><p>موضوع موردنظرتان را پیدا کنید و نکته‌های مهم را مرور کنید.</p></div>
          <label className="guides-search"><Search size={19} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="مثلاً: نکات مهم هنگام خرید ملک" aria-label="جستجو در متن راهنماها" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="پاک کردن جستجو">×</button> : <kbd>جستجو</kbd>}</label>
          <div className="guides-filter-row"><div className="guides-categories" aria-label="فیلتر موضوعی">{categories.map((item) => <button key={item} type="button" className={category === item ? "is-active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div><span className="guides-result-count">نمایش <strong>{visible.length.toLocaleString("fa-IR")}</strong> از {activeCategoryCount.toLocaleString("fa-IR")} راهنما</span></div>
        </section>

        <section className="guides-list-section" aria-label="مطالب راهنما">
          <div className="guides-list-heading"><div><span className="guides-section-kicker">دانش کاربردی املاک</span><h2>{category === "همه" ? "همه راهنماها" : category}</h2></div><span className="guides-list-count">{visible.length.toLocaleString("fa-IR")} مطلب</span></div>
          <div className="guides-list">{visible.length ? visible.map((guide) => {
            const open = openId === guide.id;
            const guideIndex = guides.indexOf(guide) + 1;
            const panelId = `guide-content-${guide.id}`;
            const content = getGuideAccordionContent(guide);
            return <article key={guide.id} className={`guide-card${open ? " is-open" : ""}`}>
              <button type="button" className="guide-card-trigger" onClick={() => setOpenId(open ? "" : guide.id)} aria-expanded={open} aria-controls={panelId}>
                <span className="guide-card-number">{String(guideIndex).padStart(2, "0")}</span>
                <span className="guide-card-copy"><small>{guide.category}</small><strong>{guide.title}</strong><em>{guide.summary}</em></span>
                <span className="guide-card-action"><span>{open ? "بستن راهنما" : "مطالعه راهنما"}</span><ArrowLeft size={17} className="guide-card-arrow" aria-hidden="true" /></span>
              </button>
              <div className="guide-card-discover"><Link to="/guides/$slug" params={{ slug: guide.id }} className="guide-article-link">مطالعه صفحه کامل <ArrowLeft size={15} /></Link></div>
              <div className="guide-card-body" id={panelId} hidden={!open}>
                <div className="guide-body-heading">
                  <span><CheckCircle2 size={17} aria-hidden="true" /> محتوای راهنما</span>
                  <small>
                    {content.sectionCount
                      ? `${content.sectionCount.toLocaleString("fa-IR")} بخش`
                      : `${content.pointCount.toLocaleString("fa-IR")} نکته`}
                    {content.sectionCount && content.pointCount
                      ? ` · ${content.pointCount.toLocaleString("fa-IR")} نکته`
                      : ""}
                  </small>
                </div>
                {content.sections.length ? (
                  <div className="guide-card-sections">
                    {content.sections.map((section, index) => (
                      <section className="guide-card-section" key={`${guide.id}-section-${index}`}>
                        <h3>{section.heading}</h3>
                        {section.paragraphs.map((paragraph, paragraphIndex) => (
                          <p key={`${guide.id}-section-${index}-paragraph-${paragraphIndex}`}>{paragraph}</p>
                        ))}
                      </section>
                    ))}
                  </div>
                ) : null}
                {content.points.length ? (
                  <div className="guide-point-list">
                    {content.points.map((point, index) => (
                      <div key={`${guide.id}-point-${index}`} className="guide-point">
                        <span className="guide-point-index">{(index + 1).toLocaleString("fa-IR")}</span>
                        <p>{point}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                <button type="button" className="guide-share" onClick={() => void shareGuide(guide)}><Share2 size={16} /> اشتراک‌گذاری این راهنما</button>
              </div>
            </article>;
          }) : <div className="guides-empty"><span className="guides-empty-icon"><Search size={23} /></span><strong>مطلبی با این مشخصات پیدا نشد.</strong><p>عبارت دیگری را امتحان کنید یا فیلتر موضوعی را تغییر دهید.</p><button type="button" onClick={() => { setQuery(""); setCategory("همه"); }}>نمایش همه راهنماها</button></div>}</div>
        </section>

        <section className="guides-cta"><div className="guides-cta-icon"><ArrowUpLeft size={23} aria-hidden="true" /></div><div className="guides-cta-copy"><span className="guides-section-kicker">قدم بعدی با هیرمند</span><h2>حالا با معیارهای روشن‌تر، فایل مناسب‌تان را پیدا کنید.</h2><p>فایل‌های موجود را ببینید یا برای انتخاب بهتر از مشاوران هیرمند کمک بگیرید.</p></div><a className="guides-cta-button" href="/properties">مشاهده فایل‌های ملکی <ArrowLeft size={17} aria-hidden="true" /></a></section>
      </main>
    </SiteChrome>
  );
}
