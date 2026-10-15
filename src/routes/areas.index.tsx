import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowUpLeft,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Compass,
  MapPinned,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { SiteChrome } from "@/components/hirmand/site-chrome";
import { NEIGHBORHOOD_GROUPS, SITE } from "@/lib/site";
import { allAreas } from "@/lib/areas";
import { absoluteUrl, socialMeta } from "@/lib/seo";
import areasDirectoryCss from "../areas-directory.css?url";

export const Route = createFileRoute("/areas/")({
  loader: async () => {
    const areas = allAreas();
    return {
      areas,
      divarAreaCount: new Set(areas.map((area) => area.divarDistrictId).filter(Boolean)).size,
          };
  },
  head: () => {
    const title = `راهنمای محله‌های اصفهان | جست‌وجوی مناطق | ${SITE.shortName}`;
    const description =
      "فهرست محله‌های اصفهان را بر اساس منطقه مرور کنید، نام محله را جست‌وجو کنید و به صفحه اختصاصی هر محله و فایل‌های ملکی هیرمند برسید.";
    const url = absoluteUrl("/areas");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow, max-image-preview:large" },
        ...socialMeta({ title, description, url }),
      ],
      links: [
        { rel: "canonical", href: url },
        { rel: "stylesheet", href: areasDirectoryCss },
      ],
    };
  },
  component: AreasDirectoryPage,
});

function normalizePersian(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("fa")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u200f\u202a-\u202e]/g, " ")
    .replace(/[-‐‑–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function AreasDirectoryPage() {
  const { areas, divarAreaCount } = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState("همه");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const directoryGroups = useMemo(() => {
    const curatedTitles = NEIGHBORHOOD_GROUPS.map((group) => group.title);
    const additionalTitles = [...new Set(areas.map((area) => area.groupTitle))]
      .filter((title) => !curatedTitles.includes(title));
    const allTitles = [...curatedTitles, ...additionalTitles];

    return allTitles.map((title, index) => ({
      title,
      number: String(index + 1).padStart(2, "0"),
      areas: areas.filter((area) => area.groupTitle === title),
    })).filter((group) => group.areas.length > 0);
  }, [areas]);

  const normalizedQuery = normalizePersian(query);
  const filteredGroups = useMemo(() => {
    return directoryGroups
      .filter((group) => activeGroup === "همه" || group.title === activeGroup)
      .map((group) => ({
        ...group,
        areas: group.areas.filter((area) => {
          if (!normalizedQuery) return true;
          return normalizePersian(`${area.name} ${area.groupTitle}`).includes(normalizedQuery);
        }),
      }))
      .filter((group) => group.areas.length > 0);
  }, [directoryGroups, activeGroup, normalizedQuery]);

  const totalAreas = directoryGroups.reduce((total, group) => total + group.areas.length, 0);
  const resultCount = filteredGroups.reduce((total, group) => total + group.areas.length, 0);
  const isFiltering = Boolean(normalizedQuery) || activeGroup !== "همه";

  function toggleGroup(groupTitle: string) {
    setExpandedGroups((current) => ({ ...current, [groupTitle]: !current[groupTitle] }));
  }

  function resetFilters() {
    setQuery("");
    setActiveGroup("همه");
    setExpandedGroups({});
  }

  return (
    <SiteChrome className="areas-directory-shell">
      <main className="areas-directory-page" id="top">
        <nav className="areas-directory-breadcrumbs" aria-label="مسیر صفحه">
          <Link to="/">صفحه اصلی</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">محله‌های اصفهان</span>
        </nav>

        <header className="areas-directory-hero">
          <div className="areas-directory-hero-copy">
            <span className="areas-directory-eyebrow">
              <span className="areas-eyebrow-dot" />
              راهنمای انتخاب محله در اصفهان
            </span>
            <h1>محلهٔ مناسب خودت را <span>پیدا کن.</span></h1>
            <p>
              از مرکز تاریخی تا محله‌های شمال، جنوب و غرب اصفهان؛ محدوده‌ها را مرور کن،
              محله‌ات را جست‌وجو کن و برای دیدن فایل‌های ملکی همان محدوده وارد صفحهٔ اختصاصی آن شو.
            </p>
            <div className="areas-directory-hero-actions">
              <a href="#areas-explorer" className="areas-directory-primary-action">
                <Search size={17} /> جست‌وجوی محله‌ها
              </a>
              <Link to="/properties" className="areas-directory-secondary-action">
                مشاهدهٔ همهٔ فایل‌ها <ArrowUpLeft size={16} />
              </Link>
            </div>
            <div className="areas-directory-proof">
              <CheckCircle2 size={16} />
              <span>فهرست محلی هیرمند همراه با همهٔ محدوده‌های کاتالوگ ذخیره‌شده؛ بدون اتصال زنده به دیوار</span>
            </div>
            <div className="areas-directory-stats" aria-label="خلاصه فهرست محله‌ها">
              <div className="areas-directory-stat">
                <strong>{totalAreas.toLocaleString("fa-IR")}</strong>
                <span>محدوده در فهرست</span>
              </div>
              <div className="areas-directory-stat">
                <strong>{divarAreaCount.toLocaleString("fa-IR")}</strong>
                <span>محدوده در کاتالوگ دیوار</span>
              </div>
              <div className="areas-directory-stat">
                <strong>۱</strong>
                <span>شهر؛ اصفهان</span>
              </div>
            </div>
          </div>

          <div className="areas-directory-hero-media">
            <img
              src="/images/isfahan-hero.jpg"
              alt="نمای معماری و سیمای شهری اصفهان"
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
            <div className="areas-hero-image-overlay" aria-hidden="true" />
            <div className="areas-hero-image-top">
              <span className="areas-hero-brand-icon"><MapPinned size={19} /></span>
              <span>HIRMAND <small>REAL ESTATE</small></span>
              <span className="areas-hero-city-tag">اصفهان</span>
            </div>
            <div className="areas-hero-image-bottom">
              <span className="areas-hero-image-kicker"><Sparkles size={13} /> شروع یک انتخاب مطمئن</span>
              <h2>هر محله، حال‌وهوای خودش را دارد.</h2>
              <p>قبل از انتخاب ملک، محدوده‌ای را پیدا کن که با نیازت هماهنگ است.</p>
            </div>
            <div className="areas-hero-image-stamp" aria-hidden="true">
              <Compass size={17} />
              <span>راهنمای محله‌ها</span>
            </div>
          </div>
        </header>

        <section id="areas-explorer" className="areas-explorer" aria-labelledby="areas-explorer-title">
          <div className="areas-explorer-heading">
            <div>
              <span className="areas-section-kicker"><Compass size={15} /> مرور هوشمند مناطق</span>
              <h2 id="areas-explorer-title">از کدام محله شروع کنیم؟</h2>
              <p>نام محله را بنویس یا یکی از مناطق زیر را انتخاب کن.</p>
            </div>
            <span className="areas-source-note"><CheckCircle2 size={14} /> منبع: کاتالوگ محلی ذخیره‌شده</span>
          </div>

          <label className="areas-search-box">
            <Search size={20} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="مثلاً مرداویج، جلفا، سپاهان‌شهر…"
              aria-label="جست‌وجو در فهرست محله‌ها"
              autoComplete="off"
            />
            {query ? (
              <button type="button" aria-label="پاک کردن جست‌وجو" onClick={() => setQuery("")}>
                <X size={17} />
              </button>
            ) : (
              <kbd>جست‌وجو</kbd>
            )}
          </label>

          <div className="areas-group-filters" aria-label="فیلتر بر اساس منطقه">
            <button
              type="button"
              className={activeGroup === "همه" ? "is-active" : ""}
              aria-pressed={activeGroup === "همه"}
              onClick={() => setActiveGroup("همه")}
            >
              همهٔ مناطق <span>{totalAreas.toLocaleString("fa-IR")}</span>
            </button>
            {directoryGroups.map((group) => (
              <button
                type="button"
                key={group.title}
                className={activeGroup === group.title ? "is-active" : ""}
                aria-pressed={activeGroup === group.title}
                onClick={() => setActiveGroup(group.title)}
              >
                {group.title}
                <span>{group.areas.length.toLocaleString("fa-IR")}</span>
              </button>
            ))}
          </div>

          <div className="areas-results-bar" aria-live="polite">
            <div>
              <span className="areas-results-label">{isFiltering ? "نتیجهٔ جست‌وجو" : "فهرست محله‌ها"}</span>
              <strong>{resultCount.toLocaleString("fa-IR")} <span>محله</span></strong>
            </div>
            {isFiltering ? (
              <button type="button" onClick={resetFilters} className="areas-reset-filters">
                پاک کردن فیلترها <X size={14} />
              </button>
            ) : (
              <span className="areas-results-hint">برای ورود به صفحهٔ هر محله، نام آن را انتخاب کن.</span>
            )}
          </div>

          {filteredGroups.length ? (
            <div className="areas-directory-groups">
              {filteredGroups.map((group) => {
                const expanded = Boolean(expandedGroups[group.title]);
                const visibleAreas = isFiltering || expanded ? group.areas : group.areas.slice(0, 12);

                return (
                  <section className="areas-region-card" key={group.title} aria-labelledby={`area-group-${group.number}`}>
                    <header className="areas-region-header">
                      <div className="areas-region-heading">
                        <span className="areas-region-number">{group.number}</span>
                        <div>
                          <span className="areas-region-label">محدودهٔ اصفهان</span>
                          <h3 id={`area-group-${group.number}`}>{group.title}</h3>
                        </div>
                      </div>
                      <span className="areas-region-count">{group.areas.length.toLocaleString("fa-IR")} محله</span>
                    </header>
                    <div className="areas-neighborhood-grid">
                      {visibleAreas.map((area) => (
                        <Link
                          key={area.slug}
                          to="/areas/$slug"
                          params={{ slug: area.slug }}
                          className="areas-neighborhood-link"
                          title={`مشاهده فایل‌های ملکی محله ${area.name}`}
                        >
                          <span className="areas-neighborhood-pin"><MapPinned size={14} /></span>
                          <span className="areas-neighborhood-name">{area.name}</span>
                          <ChevronLeft className="areas-neighborhood-arrow" size={15} />
                        </Link>
                      ))}
                    </div>
                    {!isFiltering && group.areas.length > 12 ? (
                      <button
                        type="button"
                        className="areas-show-more"
                        aria-expanded={expanded}
                        onClick={() => toggleGroup(group.title)}
                      >
                        {expanded ? "نمایش کمتر" : `نمایش همهٔ ${group.areas.length.toLocaleString("fa-IR")} محله`}
                        <ChevronDown className={expanded ? "is-expanded" : ""} size={16} />
                      </button>
                    ) : null}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="areas-no-results">
              <div className="areas-no-results-icon"><Search size={24} /></div>
              <h3>محله‌ای با این نام پیدا نشد</h3>
              <p>املای نام را بررسی کن یا همهٔ مناطق را دوباره ببین.</p>
              <button type="button" onClick={resetFilters}>نمایش همهٔ محله‌ها</button>
            </div>
          )}
        </section>

        <section className="areas-directory-footer-cta">
          <div className="areas-cta-icon"><Building2 size={23} /></div>
          <div className="areas-cta-copy">
            <span>هنوز در انتخاب محدوده مطمئن نیستی؟</span>
            <h2>برای پیدا کردن ملک مناسب، از هیرمند راهنمایی بگیر.</h2>
            <p>بودجه، نوع ملک و محدودهٔ موردنظرت را با مشاوران در میان بگذار.</p>
          </div>
          <div className="areas-cta-actions">
            <Link to="/" hash="inquiry">درخواست مشاوره <ArrowUpLeft size={16} /></Link>
            <a href={`tel:${SITE.phone.mobile}`}>تماس با دفتر</a>
          </div>
        </section>
      </main>
    </SiteChrome>
  );
}
