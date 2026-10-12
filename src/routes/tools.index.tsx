import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowLeftRight, BadgeDollarSign, Calculator, Landmark, PiggyBank, WalletCards } from "lucide-react";
import { useMemo } from "react";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { absoluteUrl, socialMeta } from "@/lib/seo";
import { SITE } from "@/lib/site";

const TOOLS = [
  {
    id: "rahn",
    href: "/tools/rahn-rent",
    title: "رهن به اجاره",
    text: "ترکیب رهن و اجاره را با نرخ تبدیل انتخابی محاسبه کنید و معادل هر حالت را ببینید.",
    icon: ArrowLeftRight,
    tag: "رهن و اجاره",
  },
  {
    id: "commission",
    href: "/tools/commission",
    title: "کمیسیون ملک",
    text: "برآورد کمیسیون خرید، فروش، رهن و اجاره را همراه با مالیات مشاهده کنید.",
    icon: WalletCards,
    tag: "کمیسیون",
  },
  {
    id: "deposit",
    href: "/tools/deposit",
    title: "سود سپرده",
    text: "سود ماهانه، سود کل دوره و مبلغ نهایی سپرده را با نرخ و مدت دلخواه حساب کنید.",
    icon: PiggyBank,
    tag: "سپرده",
  },
  {
    id: "loan",
    href: "/tools/loan",
    title: "اقساط وام",
    text: "قسط ماهانه، مجموع سود و کل پرداختی وام را با دو روش محاسبه بررسی کنید.",
    icon: Landmark,
    tag: "وام",
  },
  {
    id: "valuation",
    href: "/valuation",
    title: "ارزیابی قیمت ملک",
    text: "با مشخصات ملک و فایل‌های مشابه منتشرشده، یک برآورد اولیه از قیمت فروش دریافت کنید.",
    icon: BadgeDollarSign,
    tag: "قیمت‌گذاری",
  },
] as const;

export const Route = createFileRoute("/tools/")({
  head: () => {
    const title = `ابزارهای مالی املاک هیرمند | محاسبه‌گرهای رهن، کمیسیون، سود و وام`;
    const description =
      "مرکز ابزارهای مالی و ملکی هیرمند؛ محاسبه‌گرهای رهن و اجاره، کمیسیون، سود، وام و ارزیابی اولیه قیمت ملک.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow" },
        ...socialMeta({ title, description, url: absoluteUrl("/tools") }),
      ],
      links: [{ rel: "canonical", href: absoluteUrl("/tools") }],
    };
  },
  component: FinanceToolsHubPage,
});

function FinanceToolsHubPage() {
  const activeCount = useMemo(() => TOOLS.length, []);

  return (
    <SiteChrome>
      <main className="finance-tools-hub" id="top">
        <header className="finance-tools-hub-hero">
          <div className="finance-tools-hub-hero-icon" aria-hidden="true">
            <Calculator size={27} strokeWidth={1.8} />
          </div>
          <div>
            <span className="kicker">مرکز ابزار مالی</span>
            <h1>ابزارهای مالی و ملکی هیرمند</h1>
            <p>
              ابزارهای کاربردی برای اینکه قبل از تصمیم‌گیری، اعداد اصلی معامله، وام، سپرده و
              ترکیب رهن و اجاره را شفاف‌تر بررسی کنید.
            </p>
          </div>
          <div className="finance-tools-hub-stat">
            <strong>{activeCount.toLocaleString("fa-IR")}</strong>
            <span>ابزار فعال</span>
          </div>
        </header>

        <section className="finance-tools-hub-grid" aria-label="فهرست ابزارهای مالی">
          {TOOLS.map((tool, index) => {
            const Icon = tool.icon;
            return (
              <article key={tool.id} className="finance-tools-hub-card">
                <div className="finance-tools-hub-card-top">
                  <div className="finance-tools-hub-card-icon" aria-hidden="true">
                    <Icon size={24} strokeWidth={1.8} />
                  </div>
                  <span className="finance-tools-hub-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <span className="finance-tools-hub-tag">{tool.tag}</span>
                <h2>{tool.title}</h2>
                <p>{tool.text}</p>
                <Link to={tool.href} className="finance-tools-hub-link">
                  ورود به محاسبه‌گر
                  <ArrowLeft size={16} />
                </Link>
              </article>
            );
          })}
        </section>

        <section className="finance-tools-hub-bottom">
          <div>
            <span className="kicker">یکپارچه با سایت</span>
            <h2>هر محاسبه‌گر صفحهٔ اختصاصی خودش را دارد</h2>
            <p>
              نتیجه‌ها در همان صفحه نگه داشته می‌شوند و از داخل مرکز ابزار می‌توانید بین محاسبه‌گرهای
              مالی و ارزیابی اولیه قیمت ملک جابه‌جا شوید.
            </p>
          </div>
          <div className="finance-tools-hub-bottom-actions">
            <Link to="/properties" className="btn-gold">مشاهده فایل‌های ملک</Link>
            <Link to="/budget-match" className="btn-ghost">رفتن به بودجه‌یاب</Link>
            <Link to="/guides" className="btn-ghost">راهنمای ملکی</Link>
          </div>
        </section>

        <footer className="finance-tools-hub-note">
          <strong>{SITE.shortName}</strong>
          <span>نتایج این ابزارها برای برآورد و تصمیم‌گیری اولیه هستند؛ رقم نهایی را با شرایط جاری بانک، تعرفه و قرارداد تطبیق دهید.</span>
        </footer>
      </main>
    </SiteChrome>
  );
}
