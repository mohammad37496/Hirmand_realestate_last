import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Phone,
  RefreshCw,
  Search,
  Sparkles,
  UserRound,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { PROPERTY_OTHER_AMENITY_OPTIONS, labelForOption, PROPERTY_CABINET_OPTIONS, PROPERTY_FLOORING_OPTIONS, PROPERTY_COOLING_OPTIONS, PROPERTY_HEATING_OPTIONS, PROPERTY_WALL_CLOSET_OPTIONS } from "@/lib/property-options";
import { formatToman } from "@/lib/money";
import { propertyPath } from "@/lib/property-path";
import { SITE } from "@/lib/site";

type MatchMode = "price" | "amenities" | "both" | "smart";

type Lead = {
  id: string;
  name: string;
  phone: string;
  peopleCount: number | null;
  job: string;
  deal: string;
  propertyType: string;
  propertyTypeLabel: string;
  neighborhood: string;
  floorPreference: string;
  requestedBedrooms: number | null;
  requestedAmenities: string[];
  consultant: string;
  note: string;
  status: string;
  source: string;
  leaseDeadline: string | null;
  budgetDeposit: number | null;
  budgetRent: number | null;
  budgetPurchase: number | null;
  budgetSale: number | null;
  budgetDepositMin: number | null;
  budgetDepositMax: number | null;
  budgetRentMin: number | null;
  budgetRentMax: number | null;
  budgetPurchaseMin: number | null;
  budgetPurchaseMax: number | null;
  budgetSaleMin: number | null;
  budgetSaleMax: number | null;
  budgetEquivalent: number | null;
  budgetBedrooms: number | null;
  budgetRate: number | null;
  matchCount: number;
  createdAt: string;
};

type MatchProperty = {
  id: string;
  slug: string;
  title: string;
  status: string;
  featured: boolean;
  transactionType: string;
  transactionLabel: string;
  propertyType: string;
  propertyTypeLabel: string;
  neighborhood: string;
  address: string;
  areaM2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  floorLabel: string | null;
  totalFloors: number | null;
  builtYear: number | null;
  parking: boolean;
  elevator: boolean;
  storage: boolean;
  painted: boolean;
  wallpaper: boolean;
  convertible: boolean;
  cabinetType: string | null;
  flooringType: string | null;
  coolingSystem: string | null;
  heatingSystem: string | null;
  wallClosetType: string | null;
  otherAmenities: string[];
  price: string | null;
  deposit: string | null;
  rent: string | null;
  description: string;
  features: string[];
  images: string[];
  contactName: string;
  contactPhone: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  latitude: number | null;
  longitude: number | null;
  priceDropPercent: number | null;
  score: number;
  reasons: string[];
  priceMatch: number | null;
  amenityCoverage: number | null;
};

const STATUS_LABEL: Record<string, string> = {
  new: "جدید",
  contacted: "تماس گرفته شد",
  follow_up: "پیگیری",
  visited: "بازدید",
  contract: "قرارداد",
  closed: "ناموفق / بسته‌شده",
  spam: "اسپم",
};

const MODE_META: Record<MatchMode, { title: string; description: string }> = {
  price: {
    title: "قیمت حدودی",
    description: "بیشترین وزن امتیاز بر نزدیک بودن قیمت فایل به بودجه درخواست است.",
  },
  amenities: {
    title: "امکانات",
    description: "بیشترین وزن امتیاز بر پوشش امکاناتی است که مشتری در فرم درخواست انتخاب کرده.",
  },
  both: {
    title: "قیمت + امکانات",
    description: "قیمت و امکانات به‌صورت هم‌زمان امتیازدهی می‌شوند تا گزینه‌های متعادل‌تر بالا بیایند.",
  },
  smart: {
    title: "تطبیق هوشمند",
    description: "قیمت، امکانات، نوع ملک، محله، خواب و طبقه در یک امتیاز ترکیبی بررسی می‌شوند.",
  },
};

function fa(value: number | null | undefined) {
  return value == null ? "—" : value.toLocaleString("fa-IR");
}

function formatRange(min: number | null, max: number | null, fallback: number | null) {
  const a = min ?? fallback;
  const b = max ?? fallback;
  if (a == null && b == null) return "ثبت نشده";
  const lower = a ?? b!;
  const upper = b ?? a!;
  if (lower === upper) return formatToman(lower);
  return formatToman(lower) + " تا " + formatToman(upper);
}

function amenityLabel(value: string) {
  if (value === "parking") return "پارکینگ";
  if (value === "elevator") return "آسانسور";
  if (value === "storage") return "انباری";
  if (value === "painted") return "رنگ‌آمیزی";
  if (value === "wallpaper") return "کاغذ دیواری";
  if (value === "convertible") return "قابل تبدیل";
  return labelForOption(PROPERTY_OTHER_AMENITY_OPTIONS, value) || value;
}

function propertyDetailLabel(match: MatchProperty) {
  const parts = [
    match.areaM2 != null ? fa(match.areaM2) + " متر" : "",
    match.bedrooms != null ? (match.bedrooms === 0 ? "بدون خواب" : fa(match.bedrooms) + " خواب") : "",
    match.bathrooms != null ? fa(match.bathrooms) + " سرویس" : "",
    match.floorLabel ?? (match.floor != null ? "طبقه " + fa(match.floor) : ""),
  ].filter(Boolean);
  return parts.join(" · ");
}

function budgetLines(lead: Lead) {
  const lines: string[] = [];
  if (lead.deal === "خرید") {
    const text = formatRange(lead.budgetPurchaseMin, lead.budgetPurchaseMax, lead.budgetPurchase);
    if (text !== "ثبت نشده") lines.push("بودجه خرید: " + text);
  } else if (lead.deal === "فروش") {
    const text = formatRange(lead.budgetSaleMin, lead.budgetSaleMax, lead.budgetSale);
    if (text !== "ثبت نشده") lines.push("قیمت فروش مدنظر: " + text);
  } else {
    const deposit = formatRange(lead.budgetDepositMin, lead.budgetDepositMax, lead.budgetDeposit);
    const rent = formatRange(lead.budgetRentMin, lead.budgetRentMax, lead.budgetRent);
    if (deposit !== "ثبت نشده") lines.push("رهن: " + deposit);
    if (rent !== "ثبت نشده") lines.push("اجاره ماهانه: " + rent);
  }
  return lines;
}

function featureRows(match: MatchProperty) {
  const rows = [
    ["پارکینگ", match.parking ? "دارد" : "ندارد"],
    ["آسانسور", match.elevator ? "دارد" : "ندارد"],
    ["انباری", match.storage ? "دارد" : "ندارد"],
    ["رنگ‌آمیزی", match.painted ? "دارد" : "ندارد"],
    ["کاغذ دیواری", match.wallpaper ? "دارد" : "ندارد"],
    ["قابل تبدیل", match.convertible ? "بله" : "خیر"],
    ["کابینت", labelForOption(PROPERTY_CABINET_OPTIONS, match.cabinetType)],
    ["کف", labelForOption(PROPERTY_FLOORING_OPTIONS, match.flooringType)],
    ["سرمایش", labelForOption(PROPERTY_COOLING_OPTIONS, match.coolingSystem)],
    ["گرمایش", labelForOption(PROPERTY_HEATING_OPTIONS, match.heatingSystem)],
    ["کمد دیواری", labelForOption(PROPERTY_WALL_CLOSET_OPTIONS, match.wallClosetType)],
  ].filter(([, value]) => value);
  return rows;
}

export function AdminMatchingManager() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadQuery, setLeadQuery] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [mode, setMode] = useState<MatchMode>("smart");
  const [matches, setMatches] = useState<MatchProperty[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Array<{ id:number; type:string; title:string; note:string; createdAt:string }>>([]);
  const [feedbackBusy, setFeedbackBusy] = useState<string | null>(null);

  const loadLeads = async () => {
    setLoadingLeads(true);
    setError(null);
    try {
      const response = await fetch("/api/admin-match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "list" }),
      });
      if (!response.ok) throw new Error("بارگذاری درخواست‌ها انجام نشد.");
      const data = await response.json() as { leads?: Lead[] };
      const next = Array.isArray(data.leads) ? data.leads : [];
      setLeads(next);
      if (!selectedLeadId && next[0]) setSelectedLeadId(next[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "بارگذاری درخواست‌ها انجام نشد.");
    } finally {
      setLoadingLeads(false);
    }
  };

  useEffect(() => {
    void loadLeads();
  }, []);

  const visibleLeads = useMemo(() => {
    const q = leadQuery.trim().toLocaleLowerCase("fa-IR");
    if (!q) return leads;
    return leads.filter((lead) =>
      [lead.name, lead.phone, lead.neighborhood, lead.deal, lead.propertyTypeLabel, lead.consultant]
        .join(" ")
        .toLocaleLowerCase("fa-IR")
        .includes(q),
    );
  }, [leads, leadQuery]);

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? null;

  async function loadActivities(leadId: string) {
    try {
      const response = await fetch("/api/leads-admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "activities", id: leadId }),
      });
      const data = await response.json().catch(() => ({}));
      setActivities(Array.isArray(data.activities) ? data.activities : []);
    } catch {
      setActivities([]);
    }
  }

  function phoneIntl(phone: string) {
    const normalized = phone
      .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/[\s\-()]/g, "");
    return normalized.startsWith("0098")
      ? normalized.slice(2)
      : normalized.startsWith("98")
        ? normalized
        : normalized.replace(/^0/, "98");
  }

  function whatsappForLead(lead: Lead, selectedMatches: MatchProperty[]) {
    const lines = [
      "سلام " + lead.name + "،",
      "فایل‌هایی که بر اساس درخواست شما در هیرمند پیشنهاد شده:",
      ...selectedMatches.slice(0, 8).map((item, index) =>
        (index + 1) + ". " + item.title + " — " + SITE.url + propertyPath(item)
      ),
      "",
      "برای هماهنگی بازدید با ما در تماس باشید.",
    ];
    return "https://wa.me/" + phoneIntl(lead.phone) + "?text=" + encodeURIComponent(lines.join("\n"));
  }

  async function submitFeedback(match: MatchProperty, feedback: "sent" | "liked" | "rejected" | "visited") {
    if (!selectedLeadId || feedbackBusy) return;
    setFeedbackBusy(match.id);
    try {
      const response = await fetch("/api/admin-match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "feedback",
          leadId: selectedLeadId,
          propertyId: match.id,
          propertyTitle: match.title,
          feedback,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.statusMessage || "ثبت نتیجه فایل انجام نشد.");
      toast.success(
        feedback === "sent" ? "ارسال فایل ثبت شد." :
        feedback === "liked" ? "پسند مشتری ثبت شد." :
        feedback === "rejected" ? "رد فایل ثبت شد." : "بازدید ثبت شد.",
      );
      await loadActivities(selectedLeadId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ثبت نتیجه فایل انجام نشد.");
    } finally {
      setFeedbackBusy(null);
    }
  }

  async function runMatch() {
    if (!selectedLeadId || matching) return;
    setMatching(true);
    setError(null);
    try {
      const response = await fetch("/api/admin-match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "match", leadId: selectedLeadId, mode, limit: 30 }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.statusMessage || data?.message || "مچ کردن انجام نشد.");
      setMatches(Array.isArray(data.matches) ? data.matches : []);
      await loadActivities(selectedLeadId);
      if (!data.matches?.length) toast.info("برای این درخواست، فایل دارای سیگنال تطبیق پیدا نشد.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "مچ کردن انجام نشد.";
      setError(message);
      toast.error(message);
    } finally {
      setMatching(false);
    }
  }

  useEffect(() => {
    if (!selectedLeadId) {
      setActivities([]);
      return;
    }
    setExpandedId(null);
    setActivities([]);
    void runMatch();
    // runMatch intentionally stays out of the dependency list: it is an event-style helper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeadId, mode]);

  return (
    <div className="admin-matching-page">
      <section className="admin-matching-hero">
        <div>
          <span className="kicker"><Sparkles size={14} /> فقط مدیریت هیرمند</span>
          <h2>مچ کردن درخواست‌ها با فایل‌های موجود</h2>
          <p>هر درخواست ثبت‌شده‌ی سایت را انتخاب کنید، معیار مچ را مشخص کنید و فایل‌های منتشرشده‌ی مناسب همان مشتری را ببینید.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void loadLeads()} disabled={loadingLeads}>
          <RefreshCw size={16} className={loadingLeads ? "admin-spin" : undefined} />
          تازه‌سازی درخواست‌ها
        </button>
      </section>

      {error ? <div className="admin-matching-error">{error}</div> : null}

      <div className="admin-matching-layout">
        <aside className="admin-matching-leads admin-panel">
          <div className="admin-panel-head">
            <div>
              <span className="kicker">درخواست‌ها</span>
              <h2>{fa(leads.length)} درخواست ثبت‌شده</h2>
            </div>
          </div>
          <label className="admin-search admin-matching-search">
            <Search size={16} />
            <input
              value={leadQuery}
              onChange={(e) => setLeadQuery(e.target.value)}
              placeholder="نام، تلفن، محله یا نوع درخواست…"
              aria-label="جستجوی درخواست مشتری"
            />
          </label>
          <div className="admin-matching-lead-list">
            {loadingLeads ? (
              <div className="admin-matching-empty">در حال دریافت درخواست‌ها…</div>
            ) : visibleLeads.length === 0 ? (
              <div className="admin-matching-empty">درخواستی با این جستجو پیدا نشد.</div>
            ) : visibleLeads.map((lead) => (
              <button
                type="button"
                key={lead.id}
                className={"admin-matching-lead-item" + (lead.id === selectedLeadId ? " is-active" : "")}
                onClick={() => setSelectedLeadId(lead.id)}
              >
                <span className="admin-matching-lead-avatar"><UserRound size={17} /></span>
                <span className="admin-matching-lead-copy">
                  <strong>{lead.name}</strong>
                  <small>{lead.deal} · {lead.propertyTypeLabel || lead.propertyType || "نوع ملک نامشخص"}</small>
                  <span>{lead.neighborhood || "محله مشخص نشده"} · {lead.phone}</span>
                </span>
                {lead.matchCount > 0 ? <span className="admin-matching-count">{fa(lead.matchCount)}</span> : null}
              </button>
            ))}
          </div>
        </aside>

        <main className="admin-matching-main">
          {selectedLead ? (
            <>
              <section className="admin-panel admin-matching-request">
                <div className="admin-panel-head">
                  <div>
                    <span className="kicker">جزئیات کامل درخواست</span>
                    <h2>{selectedLead.name}</h2>
                  </div>
                  <span className="admin-matching-request-status">{STATUS_LABEL[selectedLead.status] ?? selectedLead.status}</span>
                </div>

                <div className="admin-matching-request-grid">
                  <div><small>تلفن</small><a href={"tel:" + selectedLead.phone}><Phone size={14} />{selectedLead.phone}</a></div>
                  <div><small>معامله</small><strong>{selectedLead.deal || "—"}</strong></div>
                  <div><small>نوع ملک</small><strong>{selectedLead.propertyTypeLabel || selectedLead.propertyType || "—"}</strong></div>
                  <div><small>محله</small><strong>{selectedLead.neighborhood || "—"}</strong></div>
                  <div><small>تعداد نفرات</small><strong>{fa(selectedLead.peopleCount)}</strong></div>
                  <div><small>شغل</small><strong>{selectedLead.job || "—"}</strong></div>
                  <div><small>خواب موردنظر</small><strong>{selectedLead.requestedBedrooms == null ? "فرقی ندارد" : selectedLead.requestedBedrooms === 0 ? "بدون خواب" : fa(selectedLead.requestedBedrooms) + " خواب"}</strong></div>
                  <div><small>طبقه</small><strong>{selectedLead.floorPreference || "فرقی ندارد"}</strong></div>
                </div>

                <div className="admin-matching-request-section">
                  <span>بودجه</span>
                  {budgetLines(selectedLead).map((line) => <strong key={line}>{line}</strong>)}
                  {!budgetLines(selectedLead).length ? <em>بودجه در درخواست ثبت نشده است.</em> : null}
                </div>

                <div className="admin-matching-request-section">
                  <span>امکانات موردنظر</span>
                  {selectedLead.requestedAmenities.length ? (
                    <div className="admin-matching-chip-row">
                      {selectedLead.requestedAmenities.map((item) => <span key={item}>{amenityLabel(item)}</span>)}
                    </div>
                  ) : <em>امکانات خاصی انتخاب نشده است.</em>}
                </div>

                <div className="admin-matching-request-grid admin-matching-request-grid-secondary">
                  <div><small>مشاور</small><strong>{selectedLead.consultant || "—"}</strong></div>
                  <div><small>مهلت رهن/اجاره</small><strong>{selectedLead.leaseDeadline || "—"}</strong></div>
                  <div><small>تعداد فایل مچ‌شده قبلی</small><strong>{fa(selectedLead.matchCount)}</strong></div>
                  <div><small>تاریخ ثبت</small><strong>{new Date(selectedLead.createdAt).toLocaleString("fa-IR")}</strong></div>
                </div>

                {selectedLead.note ? (
                  <div className="admin-matching-note"><NotebookIcon /> {selectedLead.note}</div>
                ) : null}
              </section>

              <section className="admin-panel admin-matching-activity">
                <div className="admin-panel-head">
                  <div><span className="kicker">سوابق مشتری</span><h2>تاریخچه پیگیری</h2></div>
                  <span className="admin-dashboard-summary">{activities.length.toLocaleString("fa-IR")} رویداد</span>
                </div>
                {activities.length ? (
                  <div className="admin-matching-timeline">
                    {activities.slice(0, 12).map((item) => (
                      <div key={item.id}><span></span><div><strong>{item.title}</strong><small>{new Date(item.createdAt).toLocaleString("fa-IR")}</small>{item.note ? <p>{item.note}</p> : null}</div></div>
                    ))}
                  </div>
                ) : <div className="admin-matching-empty">هنوز سابقه‌ای برای این مشتری ثبت نشده است.</div>}
              </section>

              <section className="admin-panel admin-matching-controls">
                <div className="admin-panel-head">
                  <div>
                    <span className="kicker">معیار مچ</span>
                    <h2>بر چه اساسی فایل‌ها را پیدا کنم؟</h2>
                  </div>
                  <button type="button" className="btn-gold" onClick={() => void runMatch()} disabled={matching}>
                    {matching ? <RefreshCw size={16} className="admin-spin" /> : <Sparkles size={16} />}
                    {matching ? "در حال مچ کردن…" : "مچ مجدد"}
                  </button>
                </div>
                <div className="admin-matching-send-all">
                  {matches.length ? (
                    <a className="btn-gold" href={whatsappForLead(selectedLead, matches)} target="_blank" rel="noopener noreferrer"
                      onClick={() => void Promise.all(matches.slice(0, 8).map((item) => submitFeedback(item, "sent")))}>
                      <Phone size={15} /> ارسال فایل‌های پیشنهادی در واتساپ
                    </a>
                  ) : null}
                </div>
                <div className="admin-matching-modes">
                  {(Object.entries(MODE_META) as Array<[MatchMode, typeof MODE_META.smart]>).map(([value, meta]) => (
                    <label key={value} className={"admin-matching-mode" + (mode === value ? " is-active" : "")}>
                      <input type="radio" name="admin-match-mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
                      <span><strong>{meta.title}</strong><small>{meta.description}</small></span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="admin-panel admin-matching-results">
                <div className="admin-panel-head">
                  <div>
                    <span className="kicker">نتیجه</span>
                    <h2>{matching ? "در حال پیدا کردن فایل مناسب…" : fa(matches.length) + " فایل پیشنهادی"}</h2>
                  </div>
                  <small>فقط فایل‌های منتشرشده بررسی شده‌اند.</small>
                </div>

                {matching ? (
                  <div className="admin-matching-loading">در حال محاسبه امتیاز و بررسی فایل‌های سایت…</div>
                ) : matches.length === 0 ? (
                  <div className="admin-matching-empty">فایل مناسبی با سیگنال کافی برای این معیار پیدا نشد.</div>
                ) : (
                  <div className="admin-matching-results-list">
                    {matches.map((match) => {
                      const open = expandedId === match.id;
                      const details = featureRows(match);
                      return (
                        <article key={match.id} className="admin-matching-card">
                          <div className="admin-matching-card-top">
                            <div className="admin-matching-score">{match.score}<small>امتیاز</small></div>
                            {match.images[0] ? <img src={match.images[0]} alt="" /> : <div className="admin-matching-image-fallback"><Building2 size={24} /></div>}
                            <div className="admin-matching-card-main">
                              <div className="admin-matching-card-title-row">
                                <h3>{match.title}</h3>
                                {match.featured ? <span className="admin-matching-featured"><BadgeCheck size={14} /> ویژه</span> : null}
                              </div>
                              <p>{match.transactionLabel} · {match.propertyTypeLabel} · {match.neighborhood}</p>
                              <strong>{propertyDetailLabel(match) || "جزئیات پایه ثبت نشده"}</strong>
                            </div>
                          </div>

                          <div className="admin-matching-card-reasons">
                            {match.reasons.slice(0, 4).map((reason) => <span key={reason}><CheckCircle2 size={13} />{reason}</span>)}
                            {match.priceMatch != null ? <span><WalletCards size={13} />تطابق قیمت {fa(match.priceMatch)}٪</span> : null}
                            {match.amenityCoverage != null ? <span><Sparkles size={13} />پوشش امکانات {fa(match.amenityCoverage)}٪</span> : null}
                          </div>

                          <div className="admin-matching-card-prices">
                            {match.price ? <div><small>قیمت</small><strong>{formatToman(Number(match.price))}</strong></div> : null}
                            {match.deposit ? <div><small>رهن</small><strong>{formatToman(Number(match.deposit))}</strong></div> : null}
                            {match.rent ? <div><small>اجاره</small><strong>{formatToman(Number(match.rent))}</strong></div> : null}
                          </div>

                          <div className="admin-matching-card-actions">
                            <a className="btn-gold" href={propertyPath(match)} target="_blank" rel="noreferrer">باز کردن فایل</a>
                            <button type="button" className="btn-ghost" onClick={() => void submitFeedback(match, "sent")} disabled={feedbackBusy === match.id}>ارسال شد</button>
                            <button type="button" className="btn-ghost" onClick={() => void submitFeedback(match, "liked")} disabled={feedbackBusy === match.id}>پسندید</button>
                            <button type="button" className="btn-ghost" onClick={() => void submitFeedback(match, "rejected")} disabled={feedbackBusy === match.id}>رد شد</button>
                            <button type="button" className="btn-ghost" onClick={() => void submitFeedback(match, "visited")} disabled={feedbackBusy === match.id}>بازدید</button>
                            <button type="button" className="btn-ghost" onClick={() => setExpandedId(open ? null : match.id)}>
                              <ChevronDown size={16} />
                              {open ? "بستن مشخصات کامل" : "مشاهده مشخصات کامل"}
                            </button>
                          </div>

                          {open ? (
                            <div className="admin-matching-card-details">
                              <div className="admin-matching-detail-grid">
                                <div><small>آدرس</small><strong>{match.address || "—"}</strong></div>
                                <div><small>سال ساخت</small><strong>{fa(match.builtYear)}</strong></div>
                                <div><small>تعداد طبقات</small><strong>{fa(match.totalFloors)}</strong></div>
                                <div><small>مختصات</small><strong>{match.latitude != null && match.longitude != null ? match.latitude.toFixed(5) + " , " + match.longitude.toFixed(5) : "—"}</strong></div>
                                {details.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}
                              </div>
                              {match.otherAmenities.length ? (
                                <div className="admin-matching-full-section">
                                  <span>امکانات تکمیلی</span>
                                  <div className="admin-matching-chip-row">{match.otherAmenities.map((item) => <span key={item}>{amenityLabel(item)}</span>)}</div>
                                </div>
                              ) : null}
                              <div className="admin-matching-full-section">
                                <span>ویژگی‌ها</span>
                                {match.features.length ? <div className="admin-matching-feature-list">{match.features.map((item) => <span key={item}>{item}</span>)}</div> : <em>ویژگی جداگانه ثبت نشده است.</em>}
                              </div>
                              <div className="admin-matching-full-section">
                                <span>توضیحات</span>
                                <p>{match.description || "توضیحی ثبت نشده است."}</p>
                              </div>
                              <div className="admin-matching-contact"><Phone size={15} /> مشاور فایل: <strong>{match.contactName}</strong> · <a href={"tel:" + match.contactPhone}>{match.contactPhone}</a></div>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          ) : (
            <section className="admin-panel admin-matching-empty-state">
              <UserRound size={34} />
              <h2>درخواستی برای مچ کردن انتخاب نشده است.</h2>
              <p>از فهرست سمت راست/بالا یک درخواست مشتری را انتخاب کنید.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function NotebookIcon() {
  return <Clock3 size={14} aria-hidden="true" />;
}
