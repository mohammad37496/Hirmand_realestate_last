import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Briefcase, Check, Handshake, Phone, ArrowRight } from "lucide-react";
import { PropertyCard } from "@/components/hirmand/property-showcase";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import {
  EitaaIcon,
  TelegramIcon,
  WhatsAppIcon,
  InstagramIcon,
  RubikaIcon,
  BaleIcon,
  IGAPPIcon,
  SoroushIcon,
} from "@/components/hirmand/social-icons";
import { listPublishedPropertiesByConsultant } from "@/lib/properties";
import { absoluteUrl, socialMeta } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { listConsultants } from "@/lib/consultants";
import { loadConsultantPropertiesWithFailureState } from "@/lib/consultant-profile-load";
import { toIranianE164Phone } from "@/lib/phone-normalization";

const ICONS = {
  briefcase: Briefcase,
  handshake: Handshake,
} as const;

export const Route = createFileRoute("/consultants/$id")({
  loader: async ({ params }) => {
    const requestedId = params.id.trim().toLowerCase();
    const people = await listConsultants();
    const person = people.find((item) => item.id.trim().toLowerCase() === requestedId) ?? null;
    if (!person) return { person: null, properties: [] };
    const result = await loadConsultantPropertiesWithFailureState(() =>
      listPublishedPropertiesByConsultant({ data: { consultantId: person.id, consultantName: person.name, phone: person.phone } }),
    );
    return { person, properties: result.properties, propertiesLoadFailed: result.failed };
  },
  head: ({ loaderData }) => {
    const person = loaderData?.person;
    if (!person) {
      return {
        meta: [
          { title: `مشاور پیدا نشد | ${SITE.nameFa}` },
          { name: "robots", content: "noindex, follow" },
        ],
      };
    }
    const title = `${person.name} | ${person.role} | ${SITE.nameFa}`;
    const description = `ارتباط مستقیم با ${person.name}، ${person.role} در گروه مشاورین املاک هیرمند و مشاهده فایل‌های فعال مرتبط.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow" },
        ...socialMeta({ title, description, url: absoluteUrl(`/consultants/${person.id}`) }),
      ],
      links: [{ rel: "canonical", href: absoluteUrl(`/consultants/${person.id}`) }],
    };
  },
  component: ConsultantProfilePage,
});

function ConsultantProfilePage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  if (!data.person) {
    return (
      <SiteChrome>
        <main className="page-shell">
          <section className="empty-state">
            <h1>مشاور پیدا نشد</h1>
            <p>پروفایل درخواستی در هیرمند وجود ندارد.</p>
            <Link to="/" className="btn-gold"><ArrowRight size={15} /> بازگشت به خانه</Link>
          </section>
        </main>
      </SiteChrome>
    );
  }

  const person = data.person;
  const Icon = ICONS[person.icon];
  const phoneTel = toIranianE164Phone(person.phone);

  const socials = [
    { href: person.whatsapp, label: "واتساپ", icon: <WhatsAppIcon size={19} /> },
    { href: person.telegram, label: "تلگرام", icon: <TelegramIcon size={19} /> },
    { href: person.eitaa, label: "ایتا", icon: <EitaaIcon size={19} /> },
    { href: person.instagram, label: "اینستاگرام", icon: <InstagramIcon size={19} /> },
    { href: person.rubika, label: "روبیکا", icon: <RubikaIcon size={19} /> },
    { href: person.bale, label: "بله", icon: <BaleIcon size={19} /> },
    { href: person.igap, label: "ایگپ", icon: <IGAPPIcon size={19} /> },
    { href: person.soroush, label: "سروش", icon: <SoroushIcon size={19} /> },
  ].filter((item) => item.href.trim());

  return (
    <SiteChrome className="property-detail-shell">
      <main className="consultant-profile-page">
        <div className="consultant-profile-single" data-consultant-id={person.id}>
          <Link to="/" className="text-link" style={{ marginBottom: 22 }}>
            <ArrowRight size={15} /> بازگشت به سایت هیرمند
          </Link>

        <section className="consultant-profile-hero">
          <div className="consultant-profile-avatar" aria-hidden="true">
            <Icon size={34} strokeWidth={1.6} />
          </div>
          <div>
            <span className="consultant-profile-role">{person.role}</span>
            <h1>{person.name}</h1>
            {phoneTel ? <a className="consultant-profile-phone" href={`tel:${phoneTel}`} dir="ltr">
              <bdi>{person.phoneDisplay.replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)])}</bdi>
            </a> : <span className="consultant-profile-phone" dir="ltr"><bdi>{person.phoneDisplay}</bdi></span>}
            <p className="consultant-profile-description">
              ارتباط مستقیم برای فایل‌ها و پیگیری درخواست‌های ملکی در هیرمند.
            </p>
            {phoneTel ? <div className="consultant-profile-actions">
              <a className="btn-gold" href={`tel:${phoneTel}`}>
                <Phone size={16} /> تماس مستقیم
              </a>
            </div> : null}
          </div>
        </section>

        <section className="consultant-profile-socials" aria-label="راه‌های ارتباطی مشاور">
          {socials.map((item) => (
            <a key={item.label} className="consultant-profile-social" href={item.href} target="_blank" rel="noopener noreferrer">
              {item.icon}
              <strong>{item.label}</strong>
            </a>
          ))}
        </section>

        <section className="section" style={{ marginTop: 56, width: "100%" }}>
          <div className="section-head">
            <span className="kicker">فایل‌های فعال</span>
            <h2>فایل‌های مرتبط با {person.name}</h2>
            <p>فایل‌های منتشرشده‌ای که برای تماس، این مشاور به‌عنوان مسئول فایل ثبت شده است.</p>
          </div>
          {data.propertiesLoadFailed ? (
            <div className="property-empty" role="alert">
              <strong>بارگذاری فایل‌های مرتبط ناموفق بود.</strong>
              <p>برای دریافت دوبارهٔ فایل‌های این مشاور تلاش کنید.</p>
              <button type="button" className="btn-gold" onClick={() => void router.invalidate()}>
                تلاش دوباره
              </button>
            </div>
          ) : data.properties.length ? (
            <div className="property-grid">
              {data.properties.map((property) => <PropertyCard key={property.id} property={property} />)}
            </div>
          ) : (
            <div className="property-empty">
              <Check size={24} />
              <strong>فعلاً فایل فعال مرتبطی برای این مشاور ثبت نشده است.</strong>
              <Link to="/properties" className="btn-gold">مشاهده همه فایل‌ها</Link>
            </div>
          )}
        </section>

        <section className="property-empty" style={{ marginTop: 32 }}>
          <strong>نیاز به فایل اختصاصی دارید؟</strong>
          <p>درخواستتان را ثبت کنید تا تیم هیرمند گزینه‌های متناسب را بررسی کند.</p>
          <Link to="/" hash="inquiry" className="btn-gold">ثبت درخواست ملک</Link>
        </section>
        </div>
      </main>
    </SiteChrome>
  );
}
