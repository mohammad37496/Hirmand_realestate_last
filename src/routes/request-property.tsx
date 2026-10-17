import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, ClipboardList, Clock3, MapPinned, ShieldCheck } from "lucide-react";
import { InquiryForm, type InquiryDraft } from "@/components/hirmand/inquiry-form";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { SITE } from "@/lib/site";
import "@/request-property.css";

const EMPTY_DRAFT: InquiryDraft = {
  deal: "",
  propertyType: "",
  neighborhood: "",
};

export const Route = createFileRoute("/request-property")({
  head: () => ({
    meta: [
      { title: "درخواست ملک | " + SITE.nameFa },
      {
        name: "description",
        content:
          "درخواست خرید، فروش، رهن یا اجاره ملک در اصفهان را با مشخص کردن بودجه، نوع ملک و محله دلخواه در سامانه هیرمند ثبت کنید.",
      },
    ],
  }),
  component: RequestPropertyPage,
});

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: "آپارتمان",
  villa: "ویلا و باغ",
  heritage: "خانه اصیل",
  office: "اداری و تجاری",
  commercial: "تجاری",
  land: "زمین",
};

const TRANSACTION_LABELS: Record<string, string> = {
  buy: "خرید",
  sell: "فروش",
  mortgage: "رهن",
  rent: "اجاره",
};

function RequestPropertyPage() {
  const [draft, setDraft] = useState<InquiryDraft>(EMPTY_DRAFT);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type") ?? "";
    const transaction = params.get("transaction") ?? "";
    const neighborhood = params.get("neighborhood")?.trim() ?? "";
    setDraft({
      deal: TRANSACTION_LABELS[transaction] ?? "",
      propertyType: PROPERTY_TYPE_LABELS[type] ?? "",
      neighborhood,
    });
  }, []);

  return (
    <SiteChrome className="request-property-shell">
      <main className="request-property-page" aria-labelledby="request-property-title">
        <section className="request-property-hero">
          <div className="request-property-hero-copy">
            <span className="kicker">مشاوره و انتخاب ملک</span>
            <h1 id="request-property-title">ملک مناسب‌تان را با یک درخواست پیدا کنید.</h1>
            <p>
              نوع معامله، بودجه و محله‌های موردنظرتان را مشخص کنید. درخواست شما در سامانه هیرمند ثبت می‌شود
              تا تیم ما بر اساس اولویت‌هایتان برای معرفی گزینه‌های مناسب و پیگیری با شما هماهنگ شود.
            </p>
            <div className="request-property-hero-points">
              <span><BadgeCheck size={17} aria-hidden="true" /> ثبت درخواست در سامانه هیرمند</span>
              <span><MapPinned size={17} aria-hidden="true" /> انتخاب از محله‌های اصفهان</span>
              <span><ShieldCheck size={17} aria-hidden="true" /> اطلاعات برای پیگیری درخواست شما</span>
            </div>
          </div>
          <div className="request-property-hero-art" aria-hidden="true">
            <span className="request-property-hero-icon"><ClipboardList size={38} strokeWidth={1.5} /></span>
            <span className="request-property-hero-art-caption">HIRMAND REAL ESTATE</span>
            <strong>از نیاز شما<br />تا انتخاب بهتر</strong>
            <span className="request-property-hero-art-line" />
          </div>
        </section>

        <div className="request-property-content">
          <section className="request-property-form-card" aria-labelledby="request-property-form-title">
            <header className="request-property-form-heading">
              <span className="kicker">فرم درخواست</span>
              <h2 id="request-property-form-title">چه ملکی مدنظرتان است؟</h2>
              <p>اطلاعات را تا جایی که می‌دانید وارد کنید؛ جزئیات دقیق‌تر به ما کمک می‌کند گزینه‌های مرتبط‌تری معرفی کنیم.</p>
            </header>
            <InquiryForm draft={draft} />
          </section>

          <aside className="request-property-sidebar" aria-label="راهنمای درخواست ملک">
            <section className="request-property-side-card">
              <span className="request-property-side-icon"><Clock3 size={20} aria-hidden="true" /></span>
              <h2>بعد از ثبت درخواست چه می‌شود؟</h2>
              <ol className="request-property-steps">
                <li><span>۱</span><div><strong>بررسی اولویت‌ها</strong><p>نوع معامله، بودجه، محله و امکانات درخواستی مرور می‌شود.</p></div></li>
                <li><span>۲</span><div><strong>هماهنگی با مشاور</strong><p>مشاور منتخب برای پیگیری درخواست و تکمیل جزئیات با شما در ارتباط خواهد بود.</p></div></li>
                <li><span>۳</span><div><strong>معرفی فایل‌های مرتبط</strong><p>گزینه‌های متناسب با نیازتان بررسی و برای هماهنگی بازدید راهنمایی می‌شوید.</p></div></li>
              </ol>
            </section>

            <section className="request-property-side-card request-property-privacy">
              <ShieldCheck size={21} aria-hidden="true" />
              <div>
                <h2>حریم خصوصی شما</h2>
                <p>اطلاعات تماس برای پیگیری همین درخواست استفاده می‌شود. لطفاً اطلاعات درست وارد کنید تا مشاور بتواند با شما هماهنگ شود.</p>
              </div>
            </section>

            <Link to="/request-tracking" className="request-property-side-link">
              <span><strong>درخواست قبلی دارید؟</strong><small>وضعیت آن را با کد رهگیری ببینید.</small></span>
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
            <Link to="/areas" className="request-property-side-link">
              <span><strong>هنوز محله را انتخاب نکرده‌اید؟</strong><small>محله‌های تحت پوشش هیرمند را ببینید.</small></span>
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </main>
    </SiteChrome>
  );
}
