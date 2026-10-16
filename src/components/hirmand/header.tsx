import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  BadgeDollarSign,
  Bell,
  BriefcaseBusiness,
  Building2,
  Calculator,
  ChevronDown,
  Grid2X2,
  Handshake,
  Hash,
  Landmark,
  LayoutGrid,
  LocateFixed,
  MapPinned,
  Menu,
  Phone,
  Search,
  Sparkles,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { NAV, SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import { CallMenu } from "./call-menu";
import { BrandLogo } from "./logo";
import { scrollToId } from "./scroll";
import { useConsultants } from "./consultants-context";

const FINANCE_NAV = [
  { id: "rahn", label: "رهن به اجاره", href: "/tools/rahn-rent", icon: ArrowLeftRight, text: "تبدیل ترکیب رهن و اجاره" },
  { id: "commission", label: "کمیسیون ملک", href: "/tools/commission", icon: WalletCards, text: "برآورد کمیسیون و مالیات" },
  { id: "deposit", label: "سود سپرده", href: "/tools/deposit", icon: BadgeDollarSign, text: "محاسبه سود و مبلغ نهایی" },
  { id: "loan", label: "اقساط وام", href: "/tools/loan", icon: Landmark, text: "قسط، سود و جمع پرداختی" },
  { id: "valuation", label: "ارزیابی قیمت ملک", href: "/valuation", icon: Calculator, text: "برآورد اولیه با فایل‌های مشابه" },
] as const;

const NAV_ICONS = {
  listings: Building2,
  services: Sparkles,
  properties: Grid2X2,
  "budget-match": Calculator,
  areas: MapPinned,
  consultants: UsersRound,
  tools: WalletCards,
  contact: Phone,
  partners: Handshake,
} as const;

const QUICK_ACTIONS = [
  { id: "notifications", href: "/notifications", label: "اعلان‌ها", text: "پیام‌ها و اطلاع‌رسانی‌های جدید", icon: Bell },
  { id: "nearby", href: "/nearby", label: "فایل‌های نزدیک من", text: "ملک‌های اطراف موقعیت انتخابی", icon: LocateFixed },
  { id: "file-code", href: "/file-code", label: "جستجوی کد فایل", text: "ورود سریع با کد اختصاصی ملک", icon: Hash },
] as const;

const PRIMARY_NAV = NAV.filter((item) => item.id !== "contact" && item.id !== "partners");
const SECONDARY_NAV = NAV.filter((item) => item.id === "contact" || item.id === "partners");

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onHome = pathname === "/";
  const consultants = useConsultants();
  const quickMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("menu-open", menuOpen);
    return () => document.body.classList.remove("menu-open");
  }, [menuOpen]);

  useEffect(() => {
    if (!quickOpen) return;
    const onPointer = (event: globalThis.MouseEvent) => {
      if (!quickMenuRef.current?.contains(event.target as Node)) setQuickOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQuickOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [quickOpen]);

  const closeMenu = () => setMenuOpen(false);
  const closeQuickMenu = () => setQuickOpen(false);

  useEffect(() => {
    if (pathname.startsWith("/tools/")) setFinanceOpen(true);
    if (pathname !== "/nearby" && pathname !== "/notifications" && pathname !== "/file-code") {
      setQuickOpen(false);
    }
  }, [pathname]);

  function goHash(event: ReactMouseEvent<HTMLAnchorElement>, id: string) {
    if (onHome) {
      scrollToId(event, id, closeMenu);
      return;
    }
    closeMenu();
  }

  return (
    <header className={cn("site-nav header-redesign", (scrolled || !onHome) && "is-scrolled")}>
      <div className="site-nav-inner">
        <Link
          to="/"
          hash="top"
          className="nav-brand"
          onClick={(event) => goHash(event, "top")}
          aria-label={`بازگشت به صفحه اصلی ${SITE.shortName}`}
        >
          <span className="nav-brand-mark">
            <BrandLogo size="nav" />
          </span>
          <span className="nav-brand-copy">
            <strong>{SITE.shortName}</strong>
            <small>املاک و مشاوره تخصصی اصفهان</small>
          </span>
        </Link>

        <nav className="nav-links" aria-label="ناوبری اصلی">
          {PRIMARY_NAV.map((item) => {
            const isFinance = item.id === "tools";
            const isFinanceCurrent = pathname.startsWith("/tools/");
            if (isFinance) {
              const FinanceIcon = NAV_ICONS.tools;
              return (
                <div key={item.id} className="nav-tools-menu">
                  <Link from="/tools/" to="/tools" className={cn("nav-tools-trigger", isFinanceCurrent && "is-current")} aria-haspopup="true" aria-expanded={isFinanceCurrent ? "true" : undefined} onClick={closeMenu}>
                    <FinanceIcon size={15} aria-hidden="true" />
                    <span>{item.label}</span>
                    <span className="nav-tools-caret" aria-hidden="true">⌄</span>
                  </Link>
                  <div className="nav-tools-dropdown" role="menu" aria-label="ابزارهای مالی">
                    <div className="nav-tools-dropdown-head">
                      <span>محاسبه‌گرهای هیرمند</span>
                      <small>ابزار مناسب را انتخاب کنید و وارد صفحه اختصاصی شوید.</small>
                    </div>
                    <div className="nav-tools-dropdown-grid">
                      {FINANCE_NAV.map((tool) => {
                        const Icon = tool.icon;
                        return (
                          <Link key={tool.id} to={tool.href} role="menuitem" className={cn("nav-tool-item", pathname === tool.href && "is-active")} onClick={closeMenu}>
                            <span className="nav-tool-item-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.9} /></span>
                            <span className="nav-tool-item-copy"><strong>{tool.label}</strong><small>{tool.text}</small></span>
                            <span className="nav-tool-item-arrow" aria-hidden="true">←</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            }

            const Icon = NAV_ICONS[item.id as keyof typeof NAV_ICONS];
            const isCurrent = item.to !== "/" && pathname === item.to;
            return (
              <Link
                key={item.id}
                to={item.to}
                hash={item.hash || undefined}
                className={cn(isCurrent && "is-current")}
                onClick={(event) => (item.to === "/" ? goHash(event, item.hash) : closeMenu())}
                aria-current={isCurrent ? "page" : undefined}
              >
                <Icon size={14} strokeWidth={1.9} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="nav-actions">
          <Link to="/smart-search" className="nav-action-search" aria-label="جستجوی هوشمند">
            <Search size={16} aria-hidden="true" />
            <span>جستجوی هوشمند</span>
          </Link>
          <Link to="/submit-property" className="nav-action-submit" aria-label="ثبت ملک">
            <Building2 size={15} aria-hidden="true" />
            <span>ثبت ملک</span>
          </Link>

          <div className="nav-quick-menu" ref={quickMenuRef}>
            <button type="button" className="nav-quick-trigger" aria-haspopup="menu" aria-expanded={quickOpen} aria-controls="desktop-quick-actions" onClick={() => setQuickOpen((value) => !value)}>
              <LayoutGrid size={15} aria-hidden="true" />
              <span>دسترسی سریع</span>
              <ChevronDown size={14} className={cn("nav-quick-caret", quickOpen && "is-open")} aria-hidden="true" />
            </button>
            {quickOpen ? (
              <div id="desktop-quick-actions" className="nav-quick-panel" role="menu" aria-label="دسترسی سریع">
                <div className="nav-quick-head">
                  <span>دسترسی سریع</span>
                  <small>ابزارهای پرکاربرد هیرمند</small>
                </div>
                <div className="nav-quick-grid">
                  {QUICK_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <Link key={action.id} to={action.href} role="menuitem" className="nav-quick-item" onClick={closeQuickMenu}>
                        <span className="nav-quick-item-icon" aria-hidden="true"><Icon size={17} strokeWidth={1.9} /></span>
                        <span className="nav-quick-item-copy"><strong>{action.label}</strong><small>{action.text}</small></span>
                        <span className="nav-quick-item-arrow" aria-hidden="true">←</span>
                      </Link>
                    );
                  })}
                  <Link
                    to="/"
                    hash="inquiry"
                    className="nav-quick-item"
                    role="menuitem"
                    onClick={(event) => {
                      closeQuickMenu();
                      if (onHome) scrollToId(event, "inquiry", closeMenu);
                      else closeMenu();
                    }}
                  >
                    <span className="nav-quick-item-icon" aria-hidden="true"><BriefcaseBusiness size={17} strokeWidth={1.9} /></span>
                    <span className="nav-quick-item-copy"><strong>درخواست ملک</strong><small>نیازتان را برای ما ثبت کنید</small></span>
                    <span className="nav-quick-item-arrow" aria-hidden="true">←</span>
                  </Link>
                  {SECONDARY_NAV.map((item) => {
                    const Icon = NAV_ICONS[item.id];
                    return (
                      <Link
                        key={item.id}
                        to={item.to}
                        hash={item.hash || undefined}
                        className="nav-quick-item"
                        role="menuitem"
                        onClick={(event) => (item.to === "/" ? goHash(event, item.hash) : closeQuickMenu())}
                      >
                        <span className="nav-quick-item-icon" aria-hidden="true"><Icon size={17} strokeWidth={1.9} /></span>
                        <span className="nav-quick-item-copy">
                          <strong>{item.label}</strong>
                          <small>{item.id === "contact" ? "تماس با دفتر و مشاوران" : "همکاری و پیگیری کد رهگیری"}</small>
                        </span>
                        <span className="nav-quick-item-arrow" aria-hidden="true">←</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <CallMenu className="nav-call-menu" buttonClassName="nav-call" align="end" />

          <button type="button" className="menu-toggle" aria-label={menuOpen ? "بستن منو" : "باز کردن منو"} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <div className={cn("mobile-menu", menuOpen && "is-open")} aria-hidden={!menuOpen} inert={!menuOpen}>
        <div className="mobile-menu-head">
          <span className="mobile-menu-head-mark"><BrandLogo size="nav" /></span>
          <span><strong>منوی هیرمند</strong><small>دسترسی سریع به بخش‌های سایت</small></span>
        </div>

        <div className="mobile-nav-section">
          <span className="mobile-nav-section-title">ناوبری اصلی</span>
          {NAV.map((item) => {
            if (item.id === "contact" || item.id === "partners") return null;
            if (item.id === "tools") {
              return (
                <div key={item.id} className={cn("mobile-tools-group", financeOpen && "is-open")}>
                  <button type="button" className="mobile-tools-trigger" aria-expanded={financeOpen} aria-controls="mobile-finance-tools" onClick={() => setFinanceOpen((value) => !value)}>
                    <span className="mobile-menu-link-main"><WalletCards size={17} aria-hidden="true" /><span>{item.label}</span></span>
                    <ChevronDown size={18} aria-hidden="true" className="mobile-tools-trigger-icon" />
                  </button>
                  <div id="mobile-finance-tools" className="mobile-tools-list" aria-label="ابزارهای مالی" aria-hidden={!financeOpen}>
                    <Link from="/tools/" to="/tools" className="mobile-tool-item mobile-tool-item-all" onClick={closeMenu}>
                      <span className="mobile-tool-item-icon" aria-hidden="true"><WalletCards size={17} strokeWidth={1.9} /></span>
                      <span><strong>همه ابزارهای مالی</strong><small>مشاهده صفحه اصلی ابزارها</small></span>
                    </Link>
                    {FINANCE_NAV.map((tool) => {
                      const Icon = tool.icon;
                      return (
                        <Link key={tool.id} to={tool.href} className={cn("mobile-tool-item", pathname === tool.href && "is-active")} onClick={closeMenu}>
                          <span className="mobile-tool-item-icon" aria-hidden="true"><Icon size={17} strokeWidth={1.9} /></span>
                          <span><strong>{tool.label}</strong><small>{tool.text}</small></span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            }

            const Icon = NAV_ICONS[item.id];
            const isCurrent = item.to !== "/" && pathname === item.to;
            return (
              <Link key={item.id} to={item.to} hash={item.hash || undefined} className={cn(isCurrent && "is-current")} onClick={(event) => (item.to === "/" ? goHash(event, item.hash) : closeMenu())} aria-current={isCurrent ? "page" : undefined}>
                <span className="mobile-menu-link-main"><Icon size={17} strokeWidth={1.9} aria-hidden="true" /><span>{item.label}</span></span>
                <span className="mobile-menu-link-arrow" aria-hidden="true">←</span>
              </Link>
            );
          })}
        </div>

        <div className="mobile-nav-section mobile-action-section">
          <span className="mobile-nav-section-title">دسترسی سریع</span>
          <Link to="/smart-search" className="mobile-menu-inquiry is-featured" onClick={closeMenu}><Search size={17} aria-hidden="true" /><span>جستجوی هوشمند</span></Link>
          <Link to="/notifications" className="mobile-menu-inquiry" onClick={closeMenu}><Bell size={17} aria-hidden="true" /><span>اعلان‌ها</span></Link>
          <Link to="/nearby" className="mobile-menu-inquiry" onClick={closeMenu}><LocateFixed size={17} aria-hidden="true" /><span>فایل‌های نزدیک من</span></Link>
          <Link to="/file-code" className="mobile-menu-inquiry" onClick={closeMenu}><Hash size={17} aria-hidden="true" /><span>جستجوی کد فایل</span></Link>
          <Link to="/submit-property" className="mobile-menu-inquiry is-submit" onClick={closeMenu}><Building2 size={17} aria-hidden="true" /><span>ثبت ملک</span></Link>
          <Link to="/" hash="inquiry" className="mobile-menu-inquiry" onClick={(event) => { if (onHome) scrollToId(event, "inquiry", closeMenu); else closeMenu(); }}>
            <BriefcaseBusiness size={17} aria-hidden="true" /> <span>درخواست ملک</span>
          </Link>
          <a href="/#contact" className="mobile-menu-inquiry" onClick={closeMenu}>
            <Phone size={17} aria-hidden="true" /> <span>تماس با هیرمند</span>
          </a>
          <Link to="/tracking" className="mobile-menu-inquiry" onClick={closeMenu}>
            <Handshake size={17} aria-hidden="true" /> <span>باشگاه همکاران</span>
          </Link>
        </div>

        <div className="mobile-call-list">
          <div className="mobile-call-list-head"><span>تماس مستقیم</span><small>انتخاب مشاور برای تماس</small></div>
          {consultants.map((person) => (
            <a key={person.id} className="mobile-call" href={`tel:${person.phone}`} onClick={closeMenu}>
              <span className="mobile-call-icon" aria-hidden="true"><Phone size={17} /></span>
              <span className="mobile-call-copy"><strong>{person.name}</strong><small>{person.role} · {person.phoneDisplay}</small></span>
              <span className="mobile-call-arrow" aria-hidden="true">←</span>
            </a>
          ))}
        </div>
      </div>
    </header>
  );
}
