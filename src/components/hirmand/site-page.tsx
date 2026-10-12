import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  Briefcase,
  Building2,
  Check,
  Compass,
  Copy,
  FileKey,
  Handshake,
  Home,
  KeyRound,
  Landmark,
  MapPinned,
  Phone,
  Scale,
  Search,
  Trees,
} from "lucide-react";
import { toast } from "sonner";
import { trackAnalyticsEvent } from "@/lib/analytics";
import {
  FAQS,
  mapLinks,
  NEIGHBORHOOD_GROUPS,
  NEIGHBORHOODS,
  PRINCIPLES,
  PROPERTY_TYPES,
  SERVICES,
  SITE,
  STEPS,
  type Neighborhood,
} from "@/lib/site";
import { FinanceTools } from "./finance-tools";
import { InquiryForm, type InquiryDraft } from "./inquiry-form";
import { MapAppButtons, MapEmbed } from "./map-apps";
import { PropertyShowcase } from "./property-showcase";
import type { PropertyCardData } from "@/lib/properties";
import { Reveal } from "./reveal";
import { scrollToId } from "./scroll";
import { SiteChrome } from "./site-chrome";
import { SmartRecommendations } from "./smart-recommendations";
import { useConsultants } from "./consultants-context";
import type { Consultant } from "@/lib/consultants";
import {
  EitaaIcon,
  InstagramIcon,
  TelegramIcon,
  WhatsAppIcon,
  RubikaIcon,
  BaleIcon,
  IGAPPIcon,
  SoroushIcon,
} from "./social-icons";

const PRINCIPLE_ICONS = {
  honesty: Scale,
  experience: Compass,
  advice: BadgeCheck,
} as const;

const SERVICE_ICONS = {
  buy: Home,
  sell: KeyRound,
  mortgage: Landmark,
  rent: Building2,
} as const;

const TYPE_ICONS = {
  apartment: Building2,
  villa: Trees,
  office: Landmark,
  heritage: Home,
} as const;

const TEAM_ICONS = {
  briefcase: Briefcase,
  handshake: Handshake,
} as const;

const OFFICE_PLACE: Neighborhood = {
  name: "دفتر هیرمند",
  address: SITE.address,
  searchQuery: "گروه مشاورین املاک هیرمند، اصفهان",
};

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    toast.success("شماره کپی شد");
    return true;
  } catch {
    toast.error("کپی انجام نشد");
    return false;
  }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy-btn"
      aria-label={label}
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const copied = await copyText(value);
        if (!copied) return;
        setDone(true);
        window.setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? <Check size={16} /> : <Copy size={16} />}
    </button>
  );
}

function SectionHead({ kicker, title, text }: { kicker: string; title: string; text?: string }) {
  return (
    <div className="section-head">
      <span className="kicker">{kicker}</span>
      <h2>{title}</h2>
      {text ? <p>{text}</p> : null}
    </div>
  );
}

function Hero() {
  const [deal, setDeal] = useState("خرید");
  const [propertyType, setPropertyType] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [maxBudget, setMaxBudget] = useState("");

  const budgetOptions =
    deal === "خرید" || deal === "فروش"
      ? [
          { value: "2000000000", label: "تا ۲ میلیارد" },
          { value: "5000000000", label: "تا ۵ میلیارد" },
          { value: "10000000000", label: "تا ۱۰ میلیارد" },
          { value: "15000000000", label: "تا ۱۵ میلیارد" },
          { value: "25000000000", label: "تا ۲۵ میلیارد" },
          { value: "40000000000", label: "تا ۴۰ میلیارد" },
          { value: "60000000000", label: "تا ۶۰ میلیارد" },
          { value: "100000000000", label: "تا ۱۰۰ میلیارد" },
        ]
      : deal === "اجاره"
        ? [
            { value: "10000000", label: "تا ۱۰ میلیون" },
            { value: "15000000", label: "تا ۱۵ میلیون" },
            { value: "20000000", label: "تا ۲۰ میلیون" },
            { value: "30000000", label: "تا ۳۰ میلیون" },
            { value: "50000000", label: "تا ۵۰ میلیون" },
            { value: "80000000", label: "تا ۸۰ میلیون" },
            { value: "100000000", label: "تا ۱۰۰ میلیون" },
          ]
        : [
            { value: "200000000", label: "تا ۲۰۰ میلیون" },
            { value: "500000000", label: "تا ۵۰۰ میلیون" },
            { value: "1000000000", label: "تا ۱ میلیارد" },
            { value: "2000000000", label: "تا ۲ میلیارد" },
            { value: "3000000000", label: "تا ۳ میلیارد" },
            { value: "5000000000", label: "تا ۵ میلیارد" },
            { value: "10000000000", label: "تا ۱۰ میلیارد" },
          ];

  function searchProperties() {
    const transaction = SERVICES.find((item) => item.title === deal)?.id;
    const type = PROPERTY_TYPES.find((item) => item.title === propertyType)?.id;
    const params = new URLSearchParams();
    if (transaction) params.set("transaction", transaction);
    if (type) params.set("type", type);
    if (neighborhood) params.set("neighborhood", neighborhood);
    if (maxBudget) params.set("maxPrice", maxBudget);
    trackAnalyticsEvent("property_search");
    window.location.assign(`/properties${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    searchProperties();
  }

  return (
    <section className="hero" id="top">
      <div className="hero-media" aria-hidden="true">
        <img
          className="hero-image"
          src="/images/isfahan-hero.jpg"
          alt=""
          decoding="async"
          fetchPriority="high"
        />
        <div className="hero-veil" />
      </div>
      <div className="hero-inner">
        <p className="hero-kicker">{SITE.nameFa}</p>
        <h1>ملک مناسب خود را در اصفهان پیدا کنید</h1>
        <p className="slogan">
          <strong>خرید، فروش، رهن و اجاره</strong>
          <span>با مشاوره مستقیم هیرمند</span>
        </p>
        <form className="hero-search" onSubmit={submit}>
          <label className="sr-only" htmlFor="hero-deal">
            نوع معامله
          </label>
          <select id="hero-deal" value={deal} onChange={(event) => setDeal(event.target.value)}>
            {SERVICES.map((item) => (
              <option key={item.id} value={item.title}>
                {item.title}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="hero-type">
            نوع ملک
          </label>
          <select
            id="hero-type"
            value={propertyType}
            onChange={(event) => setPropertyType(event.target.value)}
          >
            <option value="">نوع ملک</option>
            {PROPERTY_TYPES.map((item) => (
              <option key={item.id} value={item.title}>
                {item.title}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="hero-area">
            محله
          </label>
          <select
            id="hero-area"
            value={neighborhood}
            onChange={(event) => setNeighborhood(event.target.value)}
          >
            <option value="">محله در اصفهان</option>
            {NEIGHBORHOODS.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="hero-budget">
            سقف بودجه
          </label>
          <select
            id="hero-budget"
            value={maxBudget}
            onChange={(event) => setMaxBudget(event.target.value)}
          >
            <option value="">سقف بودجه</option>
            {budgetOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-gold search-submit">
            <Search size={16} />
            جستجوی فایل
          </button>
        </form>

        <p className="hero-search-hint">
          فیلترهای انتخابی از همان ابتدا روی فایل‌های منتشرشده هیرمند اعمال می‌شوند.
        </p>
        {/* One primary action, one secondary, one contact affordance.
            The map shortcuts and the "services" anchor both duplicated
            links that already live in the header and in the sections below,
            so they were removed to give the first screen a clear hierarchy. */}
        <div className="hero-actions">
          <Link to="/properties" className="btn-gold">
            مشاهده فایل‌ها
          </Link>
          <Link to="/" hash="inquiry" className="btn-ghost" onClick={(event) => scrollToId(event, "inquiry")}>
            درخواست اختصاصی
          </Link>
        </div>
        <div className="hero-intents" aria-label="جستجوی سریع">
          <button type="button" className="hero-intent" onClick={() => window.location.assign("/properties?transaction=buy&type=apartment")}>خرید آپارتمان</button>
          <button type="button" className="hero-intent" onClick={() => window.location.assign("/properties?transaction=mortgage&type=apartment")}>رهن آپارتمان</button>
          <button type="button" className="hero-intent" onClick={() => window.location.assign("/properties?transaction=buy&type=villa")}>خرید ویلا و باغ</button>
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  const consultants = useConsultants();
  const highlights = [
    { value: `${SERVICES.length}`, label: "مسیر اصلی معامله" },
    { value: `${consultants.length}`, label: "مشاور مستقیم" },
    { value: `${NEIGHBORHOODS.length}+`, label: "محله و محدوده در اصفهان" },
  ] as const;

  return (
    <section className="trust-strip-wrap" aria-label="اطلاعات کلیدی هیرمند">
      <div className="trust-strip">
        {highlights.map((item) => (
          <div key={item.label} className="trust-stat">
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function HomeDiscovery() {
  return (
    <Reveal as="section" className="section home-discovery" id="services">
      <SectionHead
        kicker="شروع جست‌وجو"
        title="دنبال چه هستید؟"
        text="مسیر معامله یا نوع ملک را انتخاب کنید و مستقیم به فایل‌های مرتبط بروید."
      />
      <div className="home-discovery-grid">
        {SERVICES.map((item) => {
          const Icon = SERVICE_ICONS[item.id];
          return (
            <a
              key={item.id}
              href={"/properties?transaction=" + encodeURIComponent(item.id)}
              className="home-discovery-card"
              aria-label={"جستجوی فایل برای " + item.title}
            >
              <span className="icon-box"><Icon size={20} strokeWidth={1.8} /></span>
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.id === "buy" ? "انتخاب و خرید" : item.id === "sell" ? "قیمت‌گذاری و فروش" : item.id === "mortgage" ? "رهن ملک" : "اجاره ملک"}
                </small>
              </span>
              <span aria-hidden="true">↗</span>
            </a>
          );
        })}
      </div>
      <div className="home-type-row" aria-label="انتخاب نوع ملک">
        {PROPERTY_TYPES.map((item) => {
          const Icon = TYPE_ICONS[item.id];
          return (
            <a
              key={item.id}
              href={"/properties?type=" + encodeURIComponent(item.id)}
              className="home-type-chip"
              aria-label={"جستجوی " + item.title}
            >
              <span className="icon-box sm"><Icon size={15} strokeWidth={1.8} /></span>
              <span>{item.title}</span>
            </a>
          );
        })}
      </div>
    </Reveal>
  );
}

function About() {
  return (
    <Reveal as="section" className="section about-section" id="about">
      <div className="about-grid">
        <div className="about-copy">
          <SectionHead kicker="چرا هیرمند" title="انتخاب آگاهانه، معامله شفاف" />
          <p className="lede">
            گروه مشاورین املاک هیرمند {SITE.managedBy}، در مسیر خرید، فروش، رهن یا اجاره اطلاعات روشن و
            پیگیری دقیق را در اختیار شما می‌گذارد تا تصمیم‌گیری ساده‌تر شود.
          </p>
          <div className="principle-grid">
            {PRINCIPLES.map((item) => {
              const Icon = PRINCIPLE_ICONS[item.id];
              return (
                <article key={item.id} className="principle-card">
                  <div className="icon-box">
                    <Icon size={20} strokeWidth={1.8} />
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              );
            })}
          </div>
        </div>
        <figure className="about-photo">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/a/af/Naqsh-e_Jahan_Square%2C_Isfahan.jpg"
            alt="نمایی از میدان نقش جهان اصفهان برای معرفی مجموعه هیرمند"
            loading="lazy"
            decoding="async"
          />
        </figure>
      </div>
    </Reveal>
  );
}

function TeamMessenger({ person }: { person: Consultant }) {
  const items = [
    { href: person.whatsapp, label: "واتساپ", icon: <WhatsAppIcon size={18} />, external: true },
    { href: person.telegram, label: "تلگرام", icon: <TelegramIcon size={18} />, external: true },
    { href: person.eitaa, label: "ایتا", icon: <EitaaIcon size={18} />, external: true },
    { href: person.instagram, label: "اینستاگرام", icon: <InstagramIcon size={18} />, external: true },
    { href: person.rubika, label: "روبیکا", icon: <RubikaIcon size={18} />, external: true },
    { href: person.bale, label: "بله", icon: <BaleIcon size={18} />, external: true },
    { href: person.igap, label: "ایگپ", icon: <IGAPPIcon size={18} />, external: true },
    { href: person.soroush, label: "سروش", icon: <SoroushIcon size={18} />, external: true },
  ].filter((item) => item.href.trim());

  return (
    <div className="team-socials" role="group" aria-label={`شبکه‌های اجتماعی ${person.name}`}>
      {items.map((item) => (
        <a
          key={item.label}
          className="team-social"
          href={item.href}
          target={item.external ? "_blank" : undefined}
          rel={item.external ? "noopener noreferrer" : undefined}
          aria-label={`ارسال پیام به ${person.name} در ${item.label}`}
          title={item.label}
        >
          {item.icon}
        </a>
      ))}
    </div>
  );
}
function Team() {
  const consultants = useConsultants();
  return (
    <Reveal as="section" className="section" id="team">
      <SectionHead
        kicker="مشاورین"
        title="تیم هیرمند"
        text={`${SITE.managedBy}؛ برای خرید، فروش، رهن و اجاره مستقیم در دسترس هستید.`}
      />
      <div className="team-grid">
        {consultants.map((person) => {
          const Icon = TEAM_ICONS[person.icon];
          return (
            <article key={person.id} className="team-card">
              <div className="team-avatar" aria-hidden="true">
                <Icon size={26} strokeWidth={1.7} />
              </div>
              <div className="team-copy">
                <p className="team-role">{person.role}</p>
                <h3>{person.name}</h3>
                <p className="team-phone" dir="ltr">
                  {person.phoneDisplay}
                </p>
              </div>
              <div className="team-actions">
                <a className="btn-gold" href={`tel:${person.phone}`}>
                  <Phone size={16} />
                  تماس
                </a>
                <CopyButton value={person.phone} label={`کپی شماره ${person.name}`} />
              </div>
              <Link className="team-profile-link" to="/consultants/$id" params={{ id: person.id }}>
                پروفایل مشاور ↗
              </Link>
              <TeamMessenger person={person} />
            </article>
          );
        })}
      </div>
    </Reveal>
  );
}

function Services({ onPick }: { onPick: (title: string) => void }) {
  return (
    <Reveal as="section" className="section" id="services">
      <SectionHead
        kicker="خدمات"
        title="خرید، فروش، رهن و اجاره"
        text="چهار مسیر اصلی معامله؛ با توضیح روشن و همراهی تا پایان کار."
      />
      <div className="service-grid">
        {SERVICES.map((item, index) => {
          const Icon = SERVICE_ICONS[item.id];
          return (
            <Reveal key={item.id} className="service-card" delay={index * 70}>
              <button
                type="button"
                className="service-card-button"
                onClick={() => onPick(item.title)}
                aria-label={`درخواست ${item.title}`}
              >
                <span className="icon-box">
                  <Icon size={22} strokeWidth={1.8} />
                </span>
                <span className="service-card-copy">
                  <span className="service-card-title">{item.title}</span>
                  <span className="service-card-text">{item.text}</span>
                </span>
                <span className="service-card-arrow" aria-hidden="true">↗</span>
              </button>
            </Reveal>
          );
        })}
      </div>
    </Reveal>
  );
}

function Properties({ onPick }: { onPick: (title: string) => void }) {
  return (
    <Reveal as="section" className="section" id="properties">
      <SectionHead
        kicker="انواع ملک"
        title="برای هر سبک زندگی"
        text="فایل مناسب پس از شناخت نیاز شما معرفی می‌شود. این‌ها مسیرهایی است که بیشتر روی آن کار می‌کنیم."
      />
      <div className="type-grid">
        {PROPERTY_TYPES.map((item, index) => {
          const Icon = TYPE_ICONS[item.id];
          return (
            <Reveal key={item.id} className="type-card" delay={index * 60}>
              <button type="button" onClick={() => onPick(item.title)} aria-label={`درخواست ${item.title}`}>
                <img
                  src={item.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
                <span className="type-body">
                  <span className="icon-box sm">
                    <Icon size={16} strokeWidth={1.8} />
                  </span>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </span>
              </button>
            </Reveal>
          );
        })}
      </div>
    </Reveal>
  );
}

function Process() {
  return (
    <Reveal as="section" className="section">
      <SectionHead kicker="مسیر همکاری" title="از تماس تا معامله، چهار قدم مشخص" />
      <ol className="step-grid">
        {STEPS.map((item, index) => (
          <li key={item.id} className="step-card">
            <span className="step-num">{String(index + 1).padStart(2, "0")}</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </li>
        ))}
      </ol>
    </Reveal>
  );
}

function Tools() {
  return (
    <Reveal as="section" className="section" id="tools">
      <SectionHead
        kicker="ابزار مالی"
        title="تبدیل رهن به اجاره، کمیسیون و وام"
        text="نوار لغزنده رهن و اجاره را به چپ و راست بکشید. مبالغ به تومان است و اعداد جنبه راهنما دارند."
      />
      <FinanceTools />
    </Reveal>
  );
}

function TrackingCta() {
  return (
    <Reveal as="section" className="section" id="tracking-cta">
      <Link to="/tracking" className="tracking-card">
        <div className="tracking-card-copy">
          <span className="kicker">باشگاه همکاران هیرمند</span>
          <h2>ثبت قرارداد، دریافت کد رهگیری و پاداش همکاری</h2>
          <p>
            املاک همکار می‌تواند قرارداد را آنلاین ثبت کند، وضعیت تأیید را ببیند و هر ۳ قرارداد تأییدشده
            یک اعتبار ثبت رایگان دریافت کند. برای هر دفتر، کارت ۱۲ مهر و QR اختصاصی هم داریم.
          </p>
          <span className="btn-gold tracking-cta">ورود به سامانه همکاری</span>
        </div>
        <div className="tracking-card-icon" aria-hidden="true">
          <FileKey size={42} strokeWidth={1.5} />
        </div>
      </Link>
    </Reveal>
  );
}

function Neighborhoods({ onPick }: { onPick: (name: string) => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Neighborhood>(OFFICE_PLACE);

  const groups = useMemo(() => {
    const q = query.trim();
    return NEIGHBORHOOD_GROUPS
      .map((group) => ({
        ...group,
        items: [...group.items]
          .filter((item) => !q || item.name.includes(q))
          .sort((a, b) => a.name.localeCompare(b.name, "fa", { sensitivity: "base", numeric: true })),
      }))
      .filter((group) => group.items.length > 0);
  }, [query]);

  const target: Neighborhood = {
    ...selected,
    address: selected.address || `${selected.name}، اصفهان`,
    searchQuery: selected.searchQuery || `${selected.name}، اصفهان`,
  };
  const links = mapLinks(target);

  return (
    <Reveal as="section" className="section" id="areas">
      <SectionHead
        kicker="اصفهان"
        title="محله‌هایی که در آن‌ها فعالیم"
        text={`بیش از ${NEIGHBORHOODS.length} محله و محدوده در اصفهان. هر محله را انتخاب کنید تا نشانی و مقصد آن در نشان، بلد و Google Maps بررسی شود؛ بدون ذخیره مختصات حدسی.`}
      />
      <div className="area-layout">
        <div className="area-groups">
          <label className="field area-search">
            <span className="field-label">جستجوی محله</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="مثلاً مرداویج، جلفا، حکیم نظامی"
              autoComplete="off"
            />
          </label>

          {groups.length === 0 ? (
            <p className="commission-hint">محله‌ای با این نام پیدا نشد.</p>
          ) : (
            <div className="area-dropdowns">
              {groups.map((group) => {
                const isSelectedInGroup = group.items.some((item) => item.name === selected.name);
                return (
                  <details
                    key={group.title}
                    className={"area-dropdown" + (isSelectedInGroup ? " is-active" : "")}
                    open={Boolean(query)}
                  >
                    <summary className="area-dropdown-summary">
                      <span>
                        <strong>{group.title}</strong>
                        <small>{isSelectedInGroup ? `محله انتخاب‌شده: ${selected.name}` : "انتخاب محله"}</small>
                      </span>
                      <span className="area-dropdown-caret" aria-hidden="true">⌄</span>
                    </summary>
                    <div className="area-dropdown-options">
                      {group.items.map((item) => (
                        <button
                          key={item.name}
                          type="button"
                          className={selected.name === item.name ? "area-neighborhood-option is-active" : "area-neighborhood-option"}
                          onClick={() => setSelected(item)}
                        >
                          <span>{item.name}</span>
                          {selected.name === item.name ? <Check size={15} aria-hidden="true" /> : null}
                        </button>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>

        <aside className="area-map">
          <div className="area-map-head">
            <div className="icon-box">
              <MapPinned size={20} strokeWidth={1.8} />
            </div>
            <div>
              <h3>{selected.name}</h3>
              <p>نشان و بلد مرجع اصلی؛ Google Maps برای بررسی تکمیلی</p>
            </div>
          </div>
          <MapEmbed target={target} title={`نقشه ${selected.name} در اصفهان`} />
          <MapAppButtons target={target} googleHref={links.google} />
          {selected.name !== OFFICE_PLACE.name ? (
            <button type="button" className="btn-gold area-request" onClick={() => onPick(selected.name)}>
              درخواست ملک در {selected.name}
            </button>
          ) : (
            <a className="btn-ghost area-request" href="#location" onClick={(event) => scrollToId(event, "location")}>
              جزئیات دفتر هیرمند
            </a>
          )}
        </aside>
      </div>
    </Reveal>
  );
}
function Inquiry({ draft }: { draft: InquiryDraft }) {
  return (
    <Reveal as="section" className="section inquiry-section" id="inquiry">
      <div className="inquiry-layout">
        <div>
          <SectionHead
            kicker="درخواست ملک"
            title="نیازتان را بنویسید؛ ادامه را با هم پیش می‌بریم"
            text="درخواست شما در سامانه هیرمند ثبت می‌شود و می‌توانید برای پیگیری، مستقیماً با مشاور منتخب در واتساپ یا تماس تلفنی در ارتباط باشید."
          />
        </div>
        <InquiryForm draft={draft} />
      </div>
    </Reveal>
  );
}

function Contact() {
  const consultants = useConsultants();
  const socials = [
    { href: SITE.instagram, icon: <InstagramIcon />, title: "اینستاگرام", text: "صفحه رسمی" },
    { href: SITE.telegram, icon: <TelegramIcon />, title: "تلگرام", text: "کانال هیرمند" },
    { href: SITE.eitaa, icon: <EitaaIcon />, title: "ایتا", text: "کانال هیرمند" },
    { href: SITE.whatsapp, icon: <WhatsAppIcon />, title: "واتساپ", text: "گروه اطلاع‌رسانی" },
  ];

  return (
    <Reveal as="section" className="section" id="contact">
      <SectionHead kicker="ارتباط" title="تماس مستقیم با مشاورین هیرمند" />
      <div className="contact-grid contact-grid-people">
        {consultants.map((person) => (
          <div key={person.id} className="contact-wrap">
            <a className="contact-card" href={`tel:${person.phone}`}>
              <div className="icon-box">
                <Phone size={22} strokeWidth={1.8} />
              </div>
              <span>
                <small>
                  {person.role} — {person.name}
                </small>
                <strong dir="ltr">{person.phoneDisplay}</strong>
              </span>
            </a>
            <CopyButton value={person.phone} label={`کپی شماره ${person.name}`} />
          </div>
        ))}
        <div className="contact-wrap">
          <a className="contact-card" href={`tel:${SITE.phone.office}`}>
            <div className="icon-box">
              <Building2 size={22} strokeWidth={1.8} />
            </div>
            <span>
              <small>تلفن دفتر</small>
              <strong dir="ltr">{SITE.phone.officeDisplay}</strong>
            </span>
          </a>
          <CopyButton value={SITE.phone.office} label="کپی تلفن دفتر" />
        </div>
      </div>
      <div className="social-row" aria-label="شبکه‌های اجتماعی هیرمند">
        {socials.map((social) => (
          <a
            key={social.title}
            className="social-link"
            href={social.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${social.title} — ${social.text}`}
            title={`${social.title} — ${social.text}`}
          >
            <span className="social-badge">{social.icon}</span>
          </a>
        ))}
      </div>
    </Reveal>
  );
}

function FAQ({ items }: { items: ReadonlyArray<{ q: string; a: string }> }) {
  const [orderedFaqs, setOrderedFaqs] = useState<Array<{ q: string; a: string }>>([...items]);

  useEffect(() => {
    let cancelled = false;

    const measureAndSort = () => {
      if (cancelled) return;

      const sample = document.querySelector(".faq-item summary");
      if (!sample) return;

      const styles = window.getComputedStyle(sample);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;

      context.font = [
        styles.fontStyle,
        styles.fontVariant,
        styles.fontWeight,
        styles.fontSize,
        styles.fontFamily,
      ].join(" ");

      const measured = [...items].sort(
        (a, b) => context.measureText(a.q).width - context.measureText(b.q).width,
      );

      setOrderedFaqs(measured);
    };

    const fontsReady = document.fonts?.ready;
    if (fontsReady) {
      fontsReady.then(measureAndSort).catch(measureAndSort);
    } else {
      measureAndSort();
    }

    window.addEventListener("resize", measureAndSort);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", measureAndSort);
    };
  }, [items]);

  return (
    <Reveal as="section" className="section">
      <SectionHead kicker="راهنما" title="پرسش‌های متداول" />
      <div className="faq-list">
        {orderedFaqs.map((item) => (
          <details key={item.q} className="faq-item">
            <summary>
              {item.q}
              <span aria-hidden="true">+</span>
            </summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </Reveal>
  );
}

function Location() {
  const office = OFFICE_PLACE;
  return (
    <Reveal as="section" className="section" id="location">
      <SectionHead kicker="دفتر" title="موقعیت گروه مشاورین املاک هیرمند" />
      <div className="location-card">
        <MapEmbed target={office} title="موقعیت دفتر هیرمند روی نقشه" />
        <div className="location-body">
          <div className="location-top">
            <div className="icon-box">
              <MapPinned size={22} strokeWidth={1.8} />
            </div>
            <div>
              <h3>دفتر هیرمند</h3>
              <p>{SITE.address}</p>
              <p className="hours">{SITE.hours}</p>
              <p className="hours">{SITE.managedBy}</p>
            </div>
          </div>
          <MapAppButtons target={office} googleHref={SITE.mapUrl} />
        </div>
      </div>
    </Reveal>
  );
}

export function SitePage({
  initialProperties = [],
  announcement = "",
  faqItems = FAQS,
}: {
  initialProperties?: PropertyCardData[];
  announcement?: string;
  faqItems?: ReadonlyArray<{ q: string; a: string }>;
}) {
  const [draft, setDraft] = useState<InquiryDraft>({
    deal: "خرید",
    propertyType: "",
    neighborhood: "",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const transaction = SERVICES.find((item) => item.id === params.get("transaction"))?.title;
    const propertyType = PROPERTY_TYPES.find((item) => item.id === params.get("type"))?.title;
    const neighborhood = params.get("neighborhood")?.trim() || "";
    if (transaction || propertyType || neighborhood) {
      setDraft((prev) => ({
        deal: transaction || prev.deal,
        propertyType: propertyType || prev.propertyType,
        neighborhood: neighborhood || prev.neighborhood,
      }));
    }

    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(hash);
      const disclosure = target?.closest("details.home-secondary") as HTMLDetailsElement | null;
      if (disclosure) disclosure.open = true;
      window.requestAnimationFrame(() => {
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, []);

  function goInquiry(next: Partial<InquiryDraft>, event?: MouseEvent<HTMLAnchorElement>) {
    setDraft((prev) => ({ ...prev, ...next }));
    if (event) scrollToId(event, "inquiry");
    else document.getElementById("inquiry")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <SiteChrome>
      {/* Order matters: people arrive looking for properties, so the live
          listings come straight after the hero, and the softer brand material
          (about, team, partner club) sits below the decision content. */}
      <main className="site-home">
        {announcement.trim() ? (
          <aside className="site-announcement" aria-label="اطلاعیه هیرمند">
            <span>{announcement.trim()}</span>
          </aside>
        ) : null}
        <Hero />
        <TrustStrip />
        <PropertyShowcase initialProperties={initialProperties} />
        <HomeDiscovery />
        <Inquiry draft={draft} />
        <details className="home-secondary">
          <summary>
            <span>
              <strong>اطلاعات بیشتر درباره هیرمند</strong>
              <small>محله‌ها، تیم، فرایند همکاری، ابزارها و راه‌های ارتباطی</small>
            </span>
            <span aria-hidden="true">⌄</span>
          </summary>
          <div className="home-secondary-body">
            <About />
            <Process />
            <Neighborhoods onPick={(name) => goInquiry({ neighborhood: name })} />
            <Team />
            <SmartRecommendations />
            <Tools />
            <TrackingCta />
            <FAQ items={faqItems} />
            <Contact />
            <Location />
          </div>
        </details>
      </main>
    </SiteChrome>
  );
}
