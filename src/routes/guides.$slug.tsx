import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpLeft, BookOpen, CheckCircle2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { getPublicGuides } from "@/lib/site-content";
import { SITE } from "@/lib/site";
import { absoluteUrl, breadcrumbJsonLd, socialMeta } from "@/lib/seo";
import type { GuideContent } from "@/lib/site-content-static";
import "@/guides.css";

export const Route = createFileRoute("/guides/$slug")({
  loader: async ({ params }) => {
    const guides = await getPublicGuides();
    const guide = guides.find((item) => item.id === params.slug);
    if (!guide) throw notFound();
    return { guide };
  },
  head: ({ loaderData, params }) => {
    const guide = loaderData?.guide;
    if (!guide) {
      return {
        meta: [
          { title: `راهنما پیدا نشد | ${SITE.nameFa}` },
          { name: "description", content: "این راهنمای ملکی در دسترس نیست." },
          { name: "robots", content: "noindex, follow" },
        ],
        links: [{ rel: "canonical", href: absoluteUrl(`/guides/${encodeURIComponent(params.slug)}`) }],
      };
    }
    const title = `${guide.title} | راهنمای ملکی ${SITE.shortName}`;
    const description = guide.summary || guide.points.slice(0, 2).join(" ").slice(0, 155);
    const url = absoluteUrl(`/guides/${encodeURIComponent(guide.id)}`);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow, max-image-preview:large" },
        ...socialMeta({ title, description, url, type: "article" }),
      ],
      links: [{ rel: "canonical", href: url }, { rel: "alternate", hrefLang: "fa-IR", href: url }],
    };
  },
  component: GuideArticlePage,
});

function articleJsonLd(guide: GuideContent) {
  const url = absoluteUrl(`/guides/${encodeURIComponent(guide.id)}`);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: guide.title,
    description: guide.summary,
    articleSection: guide.category,
    articleBody: guide.points.join("\n\n"),
    inLanguage: "fa-IR",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: SITE.nameFa, url: SITE.url },
    publisher: { "@id": `${SITE.url}#organization` },
  };
}

function GuideArticlePage() {
  const { guide } = Route.useLoaderData();

  const crumbs = breadcrumbJsonLd([
    { name: "صفحه اصلی", path: "/" },
    { name: "راهنمای ملکی", path: "/guides" },
    { name: guide.title, path: `/guides/${encodeURIComponent(guide.id)}` },
  ]);

  async function shareGuide(article: GuideContent) {
    const url = absoluteUrl(`/guides/${encodeURIComponent(article.id)}`);
    try {
      if (navigator.share) await navigator.share({ title: article.title, text: article.summary, url });
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); toast.success("لینک راهنما کپی شد."); }
      else window.prompt("لینک راهنما:", url);
    } catch {
      // Sharing can be cancelled by the visitor.
    }
  }

  return (
    <SiteChrome>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(guide)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }} />
      <main className="guide-article-page">
        <nav className="guides-breadcrumb" aria-label="مسیر صفحه">
          <Link to="/">صفحه اصلی</Link><ArrowLeft size={13} aria-hidden="true" /><Link to="/guides">راهنمای ملکی</Link><ArrowLeft size={13} aria-hidden="true" /><span>{guide.category}</span>
        </nav>
        <article className="guide-article-card">
          <header className="guide-article-header">
            <span className="guides-eyebrow"><BookOpen size={14} aria-hidden="true" /> {guide.category}</span>
            <h1>{guide.title}</h1>
            <p>{guide.summary}</p>
            <button type="button" className="guide-share" onClick={() => void shareGuide(guide)}><Share2 size={16} /> اشتراک‌گذاری راهنما</button>
          </header>
          <div className="guide-article-body">
            <h2><CheckCircle2 size={19} aria-hidden="true" /> نکته‌هایی که بهتر است بدانید</h2>
            <ol className="guide-article-points">
              {guide.points.map((point, index) => <li key={`${guide.id}-${index}`}><span>{(index + 1).toLocaleString("fa-IR")}</span><p>{point}</p></li>)}
            </ol>
          </div>
          <footer className="guide-article-footer">
            <div><span className="guides-section-kicker">قدم بعدی</span><h2>حالا فایل‌های متناسب با معیارهایتان را بررسی کنید.</h2><p>از جستجوی هوشمند یا فهرست فایل‌های هیرمند کمک بگیرید.</p></div>
            <div className="guide-article-actions"><Link to="/smart-search" className="guides-cta-button">جستجوی هوشمند <ArrowUpLeft size={16} /></Link><Link to="/properties" className="btn-ghost">مشاهده فایل‌ها</Link></div>
          </footer>
        </article>
      </main>
    </SiteChrome>
  );
}
