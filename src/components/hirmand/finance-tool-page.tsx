import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowLeftRight, Landmark, PiggyBank, WalletCards, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/site";

export type FinanceToolId = "rahn" | "commission" | "deposit" | "loan";

type FinanceToolPageProps = {
  tool: FinanceToolId;
  children: ReactNode;
};

const TOOLS: {
  id: FinanceToolId;
  title: string;
  text: string;
  href: "/tools/rahn-rent" | "/tools/commission" | "/tools/deposit" | "/tools/loan";
  icon: LucideIcon;
}[] = [
  {
    id: "rahn",
    title: "رهن به اجاره",
    text: "تبدیل سریع ترکیب رهن و اجاره",
    href: "/tools/rahn-rent",
    icon: ArrowLeftRight,
  },
  {
    id: "commission",
    title: "کمیسیون ملک",
    text: "برآورد کمیسیون خرید، فروش و اجاره",
    href: "/tools/commission",
    icon: WalletCards,
  },
  {
    id: "deposit",
    title: "سود سپرده",
    text: "محاسبه سود و مبلغ نهایی سپرده",
    href: "/tools/deposit",
    icon: PiggyBank,
  },
  {
    id: "loan",
    title: "اقساط وام",
    text: "محاسبه قسط، سود و جمع پرداختی",
    href: "/tools/loan",
    icon: Landmark,
  },
];

const META: Record<
  FinanceToolId,
  { title: string; description: string }
> = {
  rahn: {
    title: "محاسبه‌گر رهن به اجاره",
    description:
      "مبلغ معادل رهن را وارد کنید و با تعیین سهم اجاره، ترکیب پیشنهادی رهن و اجاره را ببینید.",
  },
  commission: {
    title: "محاسبه‌گر کمیسیون ملک",
    description:
      "برای خرید، فروش یا رهن و اجاره، برآورد کمیسیون و مالیات را شفاف‌تر بررسی کنید.",
  },
  deposit: {
    title: "محاسبه‌گر سود سپرده",
    description:
      "مبلغ سپرده، نرخ سود و مدت را وارد کنید تا سود ماهانه، سود کل و مبلغ نهایی نمایش داده شود.",
  },
  loan: {
    title: "محاسبه‌گر اقساط وام",
    description:
      "با مبلغ وام، نرخ سود و تعداد اقساط، قسط ماهانه و مجموع سود وام را محاسبه کنید.",
  },
};

export function FinanceToolPage({ tool, children }: FinanceToolPageProps) {
  const current = TOOLS.find((item) => item.id === tool) ?? TOOLS[0];
  const meta = META[tool];
  const Icon = current.icon;

  return (
    <main className="finance-tool-page" id="top">
      <div className="finance-tool-breadcrumb">
        <Link to="/">صفحه اصلی</Link>
        <span aria-hidden="true">/</span>
        <Link from="/tools/" to="/tools">ابزار مالی</Link>
        <span aria-hidden="true">/</span>
        <strong>{current.title}</strong>
      </div>

      <header className="finance-tool-hero">
        <div className="finance-tool-hero-icon" aria-hidden="true">
          <Icon size={26} strokeWidth={1.8} />
        </div>
        <div>
          <span className="kicker">ابزار مالی هیرمند</span>
          <h1>{meta.title}</h1>
          <p>{meta.description}</p>
        </div>
      </header>

      <div className="finance-tool-layout">
        <aside className="finance-tool-sidebar" aria-label="سایر ابزارهای مالی">
          <div className="finance-tool-sidebar-head">
            <span>محاسبه‌گرهای هیرمند</span>
            <small>ابزار موردنیاز را انتخاب کنید</small>
          </div>

          <nav className="finance-tool-list">
            {TOOLS.map((item) => {
              const ItemIcon = item.icon;
              const isActive = item.id === tool;
              return (
                <Link
                  key={item.id}
                  to={item.href}
                  className={cn("finance-tool-link", isActive && "is-active")}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className="finance-tool-link-icon" aria-hidden="true">
                    <ItemIcon size={18} strokeWidth={1.9} />
                  </span>
                  <span className="finance-tool-link-copy">
                    <strong>{item.title}</strong>
                    <small>{item.text}</small>
                  </span>
                  <ArrowLeft className="finance-tool-link-arrow" size={16} />
                </Link>
              );
            })}
          </nav>

          <Link from="/tools/" to="/tools" className="finance-tool-back">
            <ArrowLeft size={16} />
            بازگشت به بخش ابزار مالی
          </Link>
        </aside>

        <section className="finance-tool-content" aria-labelledby="finance-tool-title">
          <div className="finance-tool-content-head">
            <div>
              <span>محاسبه آنلاین</span>
              <strong id="finance-tool-title">{current.title}</strong>
            </div>
            <span className="finance-tool-badge">رایگان</span>
          </div>
          <div className="finance-tool-content-body">{children}</div>
        </section>
      </div>

      <footer className="finance-tool-note">
        <strong>نکته:</strong>
        <span>
          نتایج محاسبه برای برآورد و تصمیم‌گیری اولیه هستند. برای قرارداد یا رقم نهایی، تعرفه جاری، شرایط بانک
          و توافق طرفین را ملاک قرار دهید.
        </span>
        <span className="finance-tool-note-brand">{SITE.shortName}</span>
      </footer>
    </main>
  );
}
