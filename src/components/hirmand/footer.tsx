import { Link, useRouterState } from "@tanstack/react-router";
import { SITE } from "@/lib/site";
import { getPublicSiteSettings, type SiteSettings } from "@/lib/site-settings";
import { BrandLogo } from "./logo";
import { useEffect, useState } from "react";
import { scrollToId } from "./scroll";
import { EitaaIcon, InstagramIcon, TelegramIcon, WhatsAppIcon } from "./social-icons";

export function Footer() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const onHome = useRouterState({ select: (s) => s.location.pathname === "/" });
  const year = new Date().getFullYear();

  useEffect(() => {
    let cancelled = false;
    void getPublicSiteSettings().then((value) => {
      if (!cancelled) setSettings(value);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const socials = [
    { href: settings?.instagramUrl || SITE.instagram, label: "اینستاگرام هیرمند", Icon: InstagramIcon },
    { href: settings?.telegramUrl || SITE.telegram, label: "تلگرام هیرمند", Icon: TelegramIcon },
    { href: settings?.eitaaUrl || SITE.eitaa, label: "ایتا هیرمند", Icon: EitaaIcon },
    { href: settings?.whatsappUrl || SITE.whatsappDirect, label: "واتساپ هیرمند", Icon: WhatsAppIcon },
  ] as const;

  const aboutLinks = [
    { label: "درباره ما", hash: "about" },
    { label: "خدمات", hash: "services" },
    { label: "ابزار مالی", hash: "tools" },
    { label: "تماس با هیرمند", hash: "contact" },
  ] as const;

  const propertyLinks = [
    { label: "همه فایل‌ها", to: "/properties" },
    { label: "ارزیابی قیمت ملک", to: "/valuation" },
    { label: "راهنمای ملکی", to: "/guides" },
    { label: "ثبت ملک توسط مالک", to: "/submit-property" },
    { label: "درخواست ملک", hash: "inquiry" },
  ] as const;

  const utilityLinks = [
    { label: "یافتن فایل با کد", to: "/file-code" },
    { label: "پیگیری درخواست", to: "/request-tracking" },
    { label: "پرونده‌های من", to: "/my-hirmand" },
    { label: "نشان‌شده‌ها", to: "/favorites" },
    { label: "باشگاه همکاران", to: "/tracking" },
  ] as const;

  return (
    <footer className="footer">
      <div className="footer-shell">
        <div className="footer-main">
          <section className="footer-brand">
            <BrandLogo size="footer" />
            <div className="footer-brand-copy">
              <span className="footer-eyebrow">HIRMAND REAL ESTATE</span>
              <h3>{SITE.nameFa}</h3>
              <p>{settings?.footerTagline || SITE.tagline}</p>
            </div>

            <div className="footer-contact">
              <div className="footer-contact-item">
                <span className="footer-contact-label">نشانی دفتر</span>
                <p>{settings?.address || SITE.address}</p>
              </div>
              {settings?.officeHours ? (
                <div className="footer-contact-item">
                  <span className="footer-contact-label">ساعات پاسخگویی</span>
                  <p>{settings.officeHours}</p>
                </div>
              ) : null}
            </div>

            <div className="footer-socials" aria-label="شبکه‌های اجتماعی">
              <span className="footer-socials-label">ما را دنبال کنید</span>
              <div className="footer-social-row">
                {socials.map(({ href, label, Icon }) => (
                  <a
                    key={label}
                    className="footer-social-chip"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                  >
                    <Icon size={20} />
                  </a>
                ))}
              </div>
            </div>
          </section>

          <nav className="footer-nav-column" aria-label="فایل و خدمات ملکی">
            <span className="footer-nav-title">فایل و خدمات ملکی</span>
            <div className="footer-nav-list">
              {propertyLinks.map((item) => (
                "to" in item ? (
                  <Link key={item.label} to={item.to}>{item.label}</Link>
                ) : (
                  <Link
                    key={item.label}
                    to="/"
                    hash={item.hash}
                    onClick={(event) => { if (onHome) scrollToId(event, item.hash); }}
                  >
                    {item.label}
                  </Link>
                )
              ))}
            </div>
          </nav>

          <nav className="footer-nav-column" aria-label="ابزارها و دسترسی سریع">
            <span className="footer-nav-title">ابزارها و دسترسی سریع</span>
            <div className="footer-nav-list">
              {utilityLinks.map((item) => (
                <Link key={item.label} to={item.to}>{item.label}</Link>
              ))}
            </div>
          </nav>

          <nav className="footer-nav-column" aria-label="درباره هیرمند">
            <span className="footer-nav-title">درباره هیرمند</span>
            <div className="footer-nav-list">
              {aboutLinks.map((item) => (
                <Link
                  key={item.label}
                  to="/"
                  hash={item.hash}
                  onClick={(event) => { if (onHome) scrollToId(event, item.hash); }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>

        <div className="footer-action">
          <div className="footer-action-copy">
            <span className="footer-action-kicker">قدم بعدی را ساده بردارید</span>
            <strong>برای خرید، فروش، رهن و اجاره با هیرمند در ارتباط باشید.</strong>
            <p>یک درخواست ثبت کنید تا تیم هیرمند مناسب‌ترین مسیر را با شما هماهنگ کند.</p>
          </div>
          <Link to="/" hash="inquiry" className="footer-cta">
            درخواست مشاوره و فایل ملک
          </Link>
        </div>

        <div className="footer-bottom">
          <small>© {year} {SITE.nameFa} — تمامی حقوق محفوظ است</small>
          <span className="footer-bottom-note">اصفهان • پاسخگویی با هماهنگی قبلی</span>
        </div>
      </div>
    </footer>
  );
}
