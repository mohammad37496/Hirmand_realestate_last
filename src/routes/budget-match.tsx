import { createFileRoute, Link } from "@tanstack/react-router";
import { BudgetMatcher } from "@/components/hirmand/budget-matcher";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { absoluteUrl, socialMeta } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/budget-match")({
  head: () => {
    const title = `بودجه‌یاب املاک هیرمند | پیدا کردن فایل متناسب با بودجه`;
    const description =
      "بودجه رهن و اجاره را وارد کنید تا فایل‌های منتشرشده هیرمند بر اساس ارزش مالی، محله، نوع ملک و تعداد خواب با بودجه شما تطبیق داده شوند.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow" },
        { name: "keywords", content: "بودجه یاب املاک، جستجوی هوشمند ملک، رهن و اجاره اصفهان، فایل متناسب با بودجه" },
        ...socialMeta({ title, description, url: absoluteUrl("/budget-match") }),
      ],
      links: [{ rel: "canonical", href: absoluteUrl("/budget-match") }],
    };
  },
  component: BudgetMatchPage,
});

function BudgetMatchPage() {
  return (
    <SiteChrome>
      <main className="budget-match-page" id="top">
        <div className="budget-match-page-head">
          <div className="budget-match-page-breadcrumb">
            <Link to="/">صفحه اصلی</Link>
            <span aria-hidden="true">/</span>
            <strong>بودجه‌یاب</strong>
          </div>
          <div className="budget-match-page-intro">
            <div>
              <span className="kicker">جستجوی هوشمند فایل</span>
              <h1>فایل مناسب بودجه‌تان را سریع‌تر پیدا کنید</h1>
              <p>
                سقف رهن و اجاره را مشخص کنید؛ هیرمند فایل‌های منتشرشده را از نظر معادل مالی، ترکیب پرداخت
                و ترجیحات ملک بررسی می‌کند و نزدیک‌ترین گزینه‌ها را به شما نشان می‌دهد.
              </p>
            </div>
            <div className="budget-match-page-stat" aria-label="روش تطبیق بودجه">
              <strong>۰۳</strong>
              <span>سطح تطبیق</span>
              <small>داخل بودجه · قابل تبدیل · نزدیک بودجه</small>
            </div>
          </div>
        </div>

        <BudgetMatcher />

        <footer className="budget-match-page-footer">
          <strong>{SITE.shortName}</strong>
          <span>
            محاسبات این ابزار برای مقایسه و تصمیم‌گیری اولیه هستند؛ مبلغ نهایی رهن، اجاره و شرایط قرارداد
            با مالک و مشاور بررسی می‌شود.
          </span>
        </footer>
      </main>
    </SiteChrome>
  );
}
