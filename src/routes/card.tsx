import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUpLeft,
  BadgeCheck,
  Building2,
  Instagram,
  KeyRound,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  Wallet,
} from "lucide-react";
import { SITE, mapLinks } from "@/lib/site";
import "@/digital-card.css";

const OFFICE_ADDRESS =
  "اصفهان، سه‌راه سیمین، خیابان جانبازان، بلوار شهید بخشی";

const OFFICE_MAPS = mapLinks({
  label: "دفتر املاک هیرمند",
  address: OFFICE_ADDRESS,
  searchQuery: "گروه مشاورین املاک هیرمند، سه‌راه سیمین، خیابان جانبازان، بلوار شهید بخشی، اصفهان",
});

const CONTACTS = [
  {
    label: "همراه اول",
    phone: "09131056029",
    display: "0913 105 6029",
  },
  {
    label: "همراه دوم",
    phone: "09130849601",
    display: "0913 084 9601",
  },
  {
    label: "تلفن دفتر",
    phone: "03137850615",
    display: "031 3785 0615",
  },
] as const;

const SERVICES = [
  {
    title: "خرید",
    description: "پیدا کردن گزینه‌های مناسب با بودجه و محله دلخواه",
    icon: Building2,
  },
  {
    title: "فروش",
    description: "معرفی ملک و همراهی در مسیر انجام معامله",
    icon: KeyRound,
  },
  {
    title: "رهن",
    description: "بررسی فایل‌ها و شرایط متناسب با نیاز شما",
    icon: Wallet,
  },
  {
    title: "اجاره",
    description: "انتخاب ملک و هماهنگی برای بازدید و قرارداد",
    icon: BadgeCheck,
  },
] as const;

export const Route = createFileRoute("/card")({
  head: () => ({
    meta: [
      { title: "کارت ویزیت دیجیتال | گروه مشاورین املاک هیرمند" },
      {
        name: "description",
        content:
          "معرفی دفتر املاک هیرمند در اصفهان؛ خدمات خرید، فروش، رهن و اجاره، شماره‌های تماس، نشانی دفتر و راه‌های ارتباطی.",
      },
      { property: "og:title", content: "گروه مشاورین املاک هیرمند" },
      {
        property: "og:description",
        content: "برای انتخاب ملک در اصفهان، با هیرمند در ارتباط باشید.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE.url}/card` },
    ],
    links: [{ rel: "canonical", href: `${SITE.url}/card` }],
  }),
  component: DigitalBusinessCard,
});

function DigitalBusinessCard() {
  return (
    <main className="digital-card-page" dir="rtl">
      <div className="dc-shell">
        <header className="dc-topbar">
          <Link to="/" className="dc-brand" aria-label="صفحه اصلی املاک هیرمند">
            <img src="/favicon.svg" alt="" width="46" height="46" />
            <span>
              <strong>املاک هیرمند</strong>
              <small>HIRMAND REAL ESTATE</small>
            </span>
          </Link>
          <span className="dc-location-tag">
            <MapPin size={15} aria-hidden="true" />
            اصفهان
          </span>
        </header>

        <section className="dc-hero" aria-labelledby="dc-title">
          <div className="dc-hero-orbit dc-hero-orbit-one" aria-hidden="true" />
          <div className="dc-hero-orbit dc-hero-orbit-two" aria-hidden="true" />
          <div className="dc-hero-content">
            <span className="dc-eyebrow">کارت ویزیت دیجیتال</span>
            <img className="dc-hero-mark" src="/favicon.svg" alt="" width="76" height="76" />
            <p className="dc-english">HIRMAND REAL ESTATE ADVISORY GROUP</p>
            <h1 id="dc-title">گروه مشاورین املاک هیرمند</h1>
            <p className="dc-hero-copy">
              همراه شما برای انتخابی آگاهانه‌تر؛ در مسیر خرید، فروش، رهن و اجاره ملک در اصفهان.
            </p>
            <div className="dc-hero-actions">
              <a className="dc-button dc-button-gold" href={`tel:${CONTACTS[0].phone}`}>
                <Phone size={18} aria-hidden="true" />
                تماس با هیرمند
              </a>
              <a
                className="dc-button dc-button-outline"
                href={SITE.whatsappDirect}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={18} aria-hidden="true" />
                پیام در واتساپ
              </a>
            </div>
          </div>
          <div className="dc-hero-bottom" aria-hidden="true">
            <span />
            <small>REAL ESTATE · ISFAHAN</small>
            <span />
          </div>
        </section>

        <section className="dc-intro" aria-label="معرفی هیرمند">
          <div>
            <span className="dc-section-kicker">در کنار شما</span>
            <h2>از جست‌وجوی ملک تا تصمیم نهایی</h2>
          </div>
          <p>
            در هیرمند می‌توانید برای خرید، فروش، رهن یا اجاره ملک در اصفهان مشاوره بگیرید،
            فایل‌های موجود را ببینید و برای نیازتان درخواست ثبت کنید.
          </p>
        </section>

        <section className="dc-section" aria-labelledby="dc-services-title">
          <div className="dc-section-heading">
            <div>
              <span className="dc-section-kicker">خدمات ما</span>
              <h2 id="dc-services-title">چه کاری برایتان انجام دهیم؟</h2>
            </div>
            <span className="dc-section-index">01 / SERVICES</span>
          </div>
          <div className="dc-services-grid">
            {SERVICES.map(({ title, description, icon: Icon }, index) => (
              <article className="dc-service-card" key={title}>
                <span className="dc-service-number">0{index + 1}</span>
                <span className="dc-service-icon">
                  <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="dc-section dc-shortcuts" aria-labelledby="dc-shortcuts-title">
          <div className="dc-section-heading">
            <div>
              <span className="dc-section-kicker">شروع سریع</span>
              <h2 id="dc-shortcuts-title">قدم بعدی را انتخاب کنید</h2>
            </div>
            <span className="dc-section-index">02 / QUICK ACCESS</span>
          </div>
          <div className="dc-shortcut-grid">
            <Link to="/properties" className="dc-shortcut-card">
              <span className="dc-shortcut-icon"><Building2 size={21} aria-hidden="true" /></span>
              <span><strong>مشاهده فایل‌های ملکی</strong><small>فایل‌های خرید و اجاره را ببینید</small></span>
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
            <Link to="/request-property" className="dc-shortcut-card">
              <span className="dc-shortcut-icon"><BadgeCheck size={21} aria-hidden="true" /></span>
              <span><strong>ثبت درخواست ملک</strong><small>نیاز و بودجه‌تان را با ما در میان بگذارید</small></span>
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
            <Link to="/areas" className="dc-shortcut-card">
              <span className="dc-shortcut-icon"><MapPin size={21} aria-hidden="true" /></span>
              <span><strong>آشنایی با محله‌ها</strong><small>محله‌های اصفهان را بررسی کنید</small></span>
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className="dc-section" aria-labelledby="dc-contact-title">
          <div className="dc-section-heading">
            <div>
              <span className="dc-section-kicker">راه‌های ارتباطی</span>
              <h2 id="dc-contact-title">با ما در تماس باشید</h2>
            </div>
            <span className="dc-section-index">03 / CONTACT</span>
          </div>
          <div className="dc-contact-panel">
            <div className="dc-contact-list">
              {CONTACTS.map((contact, index) => (
                <a className="dc-contact-row" href={`tel:${contact.phone}`} key={contact.phone}>
                  <span className="dc-contact-icon"><Phone size={19} aria-hidden="true" /></span>
                  <span className="dc-contact-text">
                    <small>{contact.label}</small>
                    <strong dir="ltr">{contact.display}</strong>
                  </span>
                  <span className="dc-contact-action">{index === 2 ? "تماس با دفتر" : "تماس"}</span>
                </a>
              ))}
            </div>
            <a className="dc-vcard-link" href="/hirmand-contact.vcf" download>
              <span><BadgeCheck size={18} aria-hidden="true" /> ذخیره مخاطب هیرمند در تلفن همراه</span>
              <ArrowUpLeft size={18} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section className="dc-section" aria-labelledby="dc-address-title">
          <div className="dc-section-heading">
            <div>
              <span className="dc-section-kicker">آدرس دفتر</span>
              <h2 id="dc-address-title">مشتاق دیدارتان هستیم</h2>
            </div>
            <span className="dc-section-index">04 / LOCATION</span>
          </div>
          <div className="dc-address-card">
            <div className="dc-address-icon"><MapPin size={25} aria-hidden="true" /></div>
            <div className="dc-address-copy">
              <strong>دفتر گروه مشاورین املاک هیرمند</strong>
              <p>{OFFICE_ADDRESS}</p>
              <div className="dc-map-actions">
                <a href={OFFICE_MAPS.googleDirections} target="_blank" rel="noreferrer">Google Maps</a>
                <a href={OFFICE_MAPS.neshan} target="_blank" rel="noreferrer">نشان</a>
                <a href={OFFICE_MAPS.balad} target="_blank" rel="noreferrer">بلد</a>
              </div>
            </div>
          </div>
        </section>

        <section className="dc-social-section" aria-labelledby="dc-social-title">
          <div>
            <span className="dc-section-kicker">همراه هیرمند باشید</span>
            <h2 id="dc-social-title">ما را در شبکه‌های اجتماعی دنبال کنید</h2>
          </div>
          <div className="dc-social-grid">
            <a href={SITE.instagram} target="_blank" rel="noreferrer" aria-label="اینستاگرام هیرمند">
              <Instagram size={21} aria-hidden="true" /><span>اینستاگرام</span>
            </a>
            <a href={SITE.telegram} target="_blank" rel="noreferrer" aria-label="تلگرام هیرمند">
              <Send size={21} aria-hidden="true" /><span>تلگرام</span>
            </a>
            <a href={SITE.eitaa} target="_blank" rel="noreferrer" aria-label="ایتا هیرمند">
              <MessageCircle size={21} aria-hidden="true" /><span>ایتا</span>
            </a>
            <a href={SITE.whatsappDirect} target="_blank" rel="noreferrer" aria-label="واتساپ هیرمند">
              <MessageCircle size={21} aria-hidden="true" /><span>واتساپ</span>
            </a>
          </div>
        </section>

        <footer className="dc-footer">
          <Link to="/" className="dc-footer-brand">
            <img src="/favicon.svg" alt="" width="34" height="34" />
            <span>گروه مشاورین املاک هیرمند</span>
          </Link>
          <p>خانه، فقط یک مکان نیست؛ آغاز یک زندگی بهتر است.</p>
          <a href={SITE.url} className="dc-site-url">hirmandrealestate.ir</a>
          <small>© {new Date().getFullYear()} Hirmand Real Estate</small>
        </footer>
      </div>

      <div className="dc-mobile-bar" aria-label="تماس سریع">
        <a href={`tel:${CONTACTS[0].phone}`}><Phone size={18} aria-hidden="true" /> تماس مستقیم</a>
        <a href={SITE.whatsappDirect} target="_blank" rel="noreferrer">
          <MessageCircle size={18} aria-hidden="true" /> پیام در واتساپ
        </a>
      </div>
    </main>
  );
}
