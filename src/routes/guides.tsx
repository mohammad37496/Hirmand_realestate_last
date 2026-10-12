import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, CheckCircle2, Search, Share2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { SITE } from "@/lib/site";
import { getPublicGuides, type GuideContent } from "@/lib/site-content";
import "@/guides.css";

type Guide = GuideContent;

export const Route = createFileRoute("/guides")({
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
      const haystack = [item.title, item.summary, item.category, ...item.points].join(" ");
      return matchesCategory && (!q || haystack.includes(q));
    });
  }, [guides, category, query]);

  async function shareGuide(guide: Guide) {
    const url = new URL("/guides?guide=" + guide.id, window.location.origin).toString();
    try {
      if (navigator.share) await navigator.share({ title: guide.title, text: guide.summary, url });
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); toast.success("لینک راهنما کپی شد."); }
      else window.prompt("لینک راهنما:", url);
    } catch {
      // Sharing can be cancelled by the visitor.
    }
  }

  return (
    <SiteChrome>
      <main className="guides-page">
        <header className="guides-hero"><div className="guides-hero-icon" aria-hidden="true"><BookOpen size={28} /></div><div><span className="kicker">مرکز راهنمای هیرمند</span><h1>راهنمای خرید، فروش و اجاره ملک</h1><p>مطالب کوتاه و کاربردی برای اینکه قبل از بازدید، مذاکره یا تصمیم نهایی بدانید چه چیزهایی را باید کنار هم ببینید.</p></div></header>
        <section className="guides-toolbar" aria-label="جستجوی راهنما"><label className="guides-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جستجو در راهنما..." /></label><div className="guides-categories">{categories.map((item) => <button key={item} type="button" className={category === item ? "is-active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div></section>
        <section className="guides-list" aria-label="مطالب راهنما">{visible.length ? visible.map((guide) => { const open = openId === guide.id; return <article key={guide.id} className={"guide-card" + (open ? " is-open" : "")}><button type="button" className="guide-card-trigger" onClick={() => setOpenId(open ? "" : guide.id)} aria-expanded={open}><span className="guide-card-number">{String(guides.indexOf(guide) + 1).padStart(2, "0")}</span><span className="guide-card-copy"><small>{guide.category}</small><strong>{guide.title}</strong><em>{guide.summary}</em></span><ArrowLeft size={18} className="guide-card-arrow" /></button>{open ? <div className="guide-card-body"><div className="guide-point-list">{guide.points.map((point) => <div key={point} className="guide-point"><CheckCircle2 size={17} /><p>{point}</p></div>)}</div><button type="button" className="btn-ghost guide-share" onClick={() => void shareGuide(guide)}><Share2 size={15} /> اشتراک راهنما</button></div> : null}</article>; }) : <div className="guides-empty"><Search size={25} /><strong>راهنمایی با این عبارت پیدا نشد.</strong><p>عبارت کوتاه‌تری جستجو کنید یا دسته‌بندی را روی «همه» بگذارید.</p></div>}</section>
        <section className="guides-cta"><div><span className="kicker">از راهنما به فایل واقعی</span><h2>حالا فایل‌های موجود را با همین معیارها بررسی کنید.</h2></div><a className="btn-gold" href="/properties">مشاهده فایل‌ها</a></section>
      </main>
    </SiteChrome>
  );
}