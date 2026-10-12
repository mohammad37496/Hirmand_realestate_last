import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Briefcase, Handshake, Phone, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { listConsultants, type Consultant } from "@/lib/consultants";
import { absoluteUrl, socialMeta } from "@/lib/seo";

export const Route = createFileRoute("/consultants/")({
  head: () => {
    const title = `مشاورین املاک هیرمند | تیم فروش و مشاوره ملک در اصفهان`;
    const description =
      "معرفی مشاورین و اعضای تیم گروه مشاورین املاک هیرمند در اصفهان؛ مشاهده پروفایل، اطلاعات تماس و فایل‌های مرتبط هر مشاور.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow" },
        ...socialMeta({ title, description, url: absoluteUrl("/consultants") }),
      ],
      links: [{ rel: "canonical", href: absoluteUrl("/consultants") }],
    };
  },
  component: ConsultantsPage,
});

function consultantIcon(person: Consultant) {
  return person.icon === "briefcase" ? Briefcase : Handshake;
}

function ConsultantsPage() {
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void listConsultants()
      .then((items) => {
        if (!cancelled) setConsultants(items);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim();
    return consultants
      .filter((person) => !q || `${person.name} ${person.role} ${person.bio}`.includes(q))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "fa"));
  }, [consultants, query]);

  return (
    <SiteChrome>
      <main className="consultants-directory-page" id="top">
        <header className="consultants-directory-hero">
          <div>
            <span className="kicker">تیم هیرمند</span>
            <h1>مشاورین املاک هیرمند</h1>
            <p>
              اعضای تیم، نقش هر شخص، اطلاعات تماس و مسیر ورود به پروفایل اختصاصی او را یکجا ببینید.
              این فهرست از بخش مدیریت قابل توسعه است.
            </p>
          </div>
          <div className="consultants-directory-count">
            <strong>{consultants.length.toLocaleString("fa-IR")}</strong>
            <span>عضو فعال</span>
          </div>
        </header>

        <div className="consultants-directory-toolbar">
          <label className="consultants-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="جستجوی نام یا سمت مشاور…"
              aria-label="جستجوی مشاور"
            />
          </label>
          <Link to="/" hash="contact" className="btn-gold">
            تماس با هیرمند
          </Link>
        </div>

        {loading ? (
          <section className="consultants-empty">
            <strong>در حال دریافت فهرست مشاورین…</strong>
          </section>
        ) : filtered.length ? (
          <section className="consultants-grid" aria-label="فهرست مشاورین">
            {filtered.map((person) => {
              const Icon = consultantIcon(person);
              return (
                <article key={person.id} className="consultant-directory-card">
                  <div className="consultant-directory-top">
                    <div className="consultant-directory-avatar" aria-hidden="true">
                      <Icon size={28} strokeWidth={1.7} />
                    </div>
                    <div className="consultant-directory-identity">
                      <span>{person.role}</span>
                      <h2>{person.name}</h2>
                    </div>
                  </div>

                  <p className="consultant-directory-bio">
                    {person.bio || "مشاوره و پیگیری فایل‌های ملکی هیرمند در اصفهان."}
                  </p>

                  <div className="consultant-directory-contact">
                    <a href={`tel:${person.phone}`} dir="ltr">
                      <Phone size={16} />
                      <bdi>{person.phoneDisplay}</bdi>
                    </a>
                  </div>

                  <div className="consultant-directory-actions">
                    <Link
                      to="/consultants/$id"
                      params={{ id: person.id }}
                      className="btn-gold"
                    >
                      مشاهده پروفایل
                      <ArrowLeft size={16} />
                    </Link>
                    <a href={`tel:${person.phone}`} className="btn-ghost">
                      تماس
                    </a>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="consultants-empty">
            <strong>موردی پیدا نشد.</strong>
            <p>عبارت جستجو را تغییر دهید یا فهرست کامل مشاورین را ببینید.</p>
          </section>
        )}

        <section className="consultants-directory-note">
          <div>
            <span className="kicker">رشد تیم</span>
            <h2>پروفایل هر عضو مستقل است</h2>
            <p>
              با اضافه‌شدن مشاور جدید در پنل مدیریت، کارت او در این فهرست و پروفایل اختصاصی‌اش قابل نمایش
              خواهد بود.
            </p>
          </div>
          <Link to="/properties" className="text-link">
            مشاهده فایل‌های فعال
            <ArrowLeft size={15} />
          </Link>
        </section>
      </main>
    </SiteChrome>
  );
}
