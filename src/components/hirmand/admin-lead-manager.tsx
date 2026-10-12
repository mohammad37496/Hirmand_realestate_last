import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Clock3,
  Download,
  ExternalLink,
  MessageCircle,
  NotebookPen,
  Phone,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  UserRound,
  Flame,
} from "lucide-react";
import { toast } from "sonner";
import { SITE } from "@/lib/site";
import { formatToman } from "@/lib/money";
import {
  AdminErrorBanner,
  AdminListSkeleton,
  AdminPagination,
} from "@/components/hirmand/admin-ui";
import { adminErrorMessage, fa, useConfirmDialog } from "@/components/hirmand/admin-ui-utils";
import { PROPERTY_OTHER_AMENITY_OPTIONS } from "@/lib/property-options";
import { daysUntilDateOnly, formatPersianDate } from "@/lib/persian-date";
import { AdminLeadDedupe } from "@/components/hirmand/admin-lead-dedupe";
import { AdminLeadAssignmentBalancer } from "@/components/hirmand/admin-lead-assignment-balancer";
import { AdminLeadMessageTemplates } from "@/components/hirmand/admin-lead-message-templates";
import { AdminLead360 } from "@/components/hirmand/admin-lead-360";
import { AdminLeadSegments } from "@/components/hirmand/admin-lead-segments";

type LeadStatus = "new" | "contacted" | "follow_up" | "visited" | "contract" | "closed" | "spam";
type VisitStatus = "none" | "requested" | "confirmed" | "completed" | "cancelled";
type LeadPriority = "hot" | "warm" | "cold";
type Lead = {
  id: string;
  name: string;
  phone: string;
  peopleCount: number | null;
  job: string;
  deal: string;
  propertyType: string;
  neighborhood: string;
  floorPreference: string;
  requestedAmenities: string[];
  consultant: string;
  note: string;
  status: LeadStatus;
  createdAt: string;
  source: string;
  acquisitionSource: string | null;
  acquisitionMedium: string | null;
  acquisitionCampaign: string | null;
  acquisitionReferrer: string | null;
  followUpAt: string | null;
  lastContactedAt: string | null;
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
  requestedBedrooms: number | null;
  budgetEquivalent: number | null;
  budgetBedrooms: number | null;
  budgetRate: number | null;
  matchCount: number;
  propertyId: string | null;
  callbackPreferredAt: string | null;
  offerAmount: number | null;
  offerConditions: string;
  visitPreferredAt: string | null;
  visitRequestedAt: string | null;
  visitStatus: VisitStatus;
  priorityScore: number;
  priority: LeadPriority;
  matchedProperties: Array<{
    slug: string;
    title: string;
    tier: "within" | "convertible" | "near";
    score: number;
    suggestedDeposit: number;
    suggestedRent: number;
  }>;
};

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "جدید",
  contacted: "تماس گرفته شد",
  follow_up: "پیگیری",
  visited: "بازدید",
  contract: "قرارداد",
  closed: "ناموفق / بسته‌شده",
  spam: "اسپم",
};

const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  none: "بدون بازدید",
  requested: "درخواست بازدید",
  confirmed: "بازدید تأیید شد",
  completed: "بازدید انجام شد",
  cancelled: "بازدید لغو شد",
};

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function leaseDeadlineMeta(value: string) {
  const days = daysUntilDateOnly(value);
  if (days == null) return { tone: "normal", text: "" };
  if (days < 0) return { tone: "expired", text: "مهلت گذشته" };
  if (days === 0) return { tone: "today", text: "مهلت امروز است" };
  if (days === 1) return { tone: "soon", text: "۱ روز باقی مانده" };
  return { tone: days <= 7 ? "soon" : "normal", text: days.toLocaleString("fa-IR") + " روز باقی مانده" };
}

function formatBudgetRange(min: number | null, max: number | null, fallback: number | null) {
  const lower = min ?? fallback;
  const upper = max ?? fallback;
  if (!lower && !upper) return "—";
  if ((lower ?? 0) === (upper ?? 0)) return formatToman(lower ?? upper ?? 0);
  return formatToman(lower ?? upper ?? 0) + " تا " + formatToman(upper ?? lower ?? 0);
}

function leadPriorityMeta(lead: Lead) {
  return lead.priority === "hot" ? { label: "داغ", tone: "hot" } : lead.priority === "warm" ? { label: "مهم", tone: "warm" } : { label: "عادی", tone: "cold" };
}

function amenityLabel(value: string) {
  if (value === "parking") return "پارکینگ";
  if (value === "elevator") return "آسانسور";
  if (value === "storage") return "انباری";
  return PROPERTY_OTHER_AMENITY_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

const PAGE_SIZE = 25;

export function AdminLeadManager({ staffMode = false }: { staffMode?: boolean } = {}) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "name" | "follow_up" | "priority">("newest");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [openFollowUpId, setOpenFollowUpId] = useState<string | null>(null);
  const [followUpDraft, setFollowUpDraft] = useState("");
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [openActivityId, setOpenActivityId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Record<string, Array<{ id: number; type: string; title: string; note: string; createdAt: string }>>>({});
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const requestId = useRef(0);

  // Search runs on the server; debounce so each keystroke does not hit the DB.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, statusFilter, sort]);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/leads-admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "list",
          query: debouncedQuery.trim() || undefined,
          status: statusFilter === "all" ? undefined : statusFilter,
          sort,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        }),
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as
          | { statusMessage?: string; message?: string }
          | null;
        throw new Error(failure?.statusMessage || failure?.message || "بارگذاری درخواست‌ها انجام نشد.");
      }
      const data = (await response.json()) as { leads?: Lead[]; total?: number };
      // A slow page-1 request must never overwrite page 2.
      if (currentRequest !== requestId.current) return;
      setLeads(Array.isArray(data.leads) ? data.leads : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setLoadError(adminErrorMessage(error, "بارگذاری درخواست‌ها انجام نشد."));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [debouncedQuery, statusFilter, sort, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function postLead(body: Record<string, unknown>) {
    const response = await fetch("/api/leads-admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as
        | { statusMessage?: string; message?: string }
        | null;
      throw new Error(result?.statusMessage || result?.message || "درخواست انجام نشد.");
    }
    return response;
  }

  async function updateStatus(id: string, status: LeadStatus) {
    if (busyId) return;
    setBusyId(id);
    try {
      await postLead({ action: "status", id, status });
      setLeads((prev) => prev.map((lead) => (lead.id === id ? { ...lead, status } : lead)));
      toast.success("وضعیت درخواست به‌روزرسانی شد.");
    } catch (error) {
      toast.error(adminErrorMessage(error, "تغییر وضعیت انجام نشد."));
    } finally {
      setBusyId(null);
    }
  }

  async function updateVisitStatus(id: string, visitStatus: VisitStatus) {
    if (busyId) return;
    setBusyId(id);
    try {
      await postLead({ action: "visit_status", id, visitStatus });
      setLeads((prev) => prev.map((lead) => (lead.id === id ? { ...lead, visitStatus } : lead)));
      toast.success("وضعیت بازدید به‌روزرسانی شد.");
    } catch (error) {
      toast.error(adminErrorMessage(error, "تغییر وضعیت بازدید انجام نشد."));
    } finally {
      setBusyId(null);
    }
  }

  async function saveNote(id: string) {
    if (savingNote) return;
    setSavingNote(true);
    try {
      await postLead({ action: "note", id, note: noteDraft });
      setLeads((prev) => prev.map((lead) => (lead.id === id ? { ...lead, note: noteDraft } : lead)));
      setOpenNoteId(null);
      toast.success("یادداشت ذخیره شد.");
    } catch (error) {
      toast.error(adminErrorMessage(error, "ذخیره یادداشت انجام نشد."));
    } finally {
      setSavingNote(false);
    }
  }

  async function saveFollowUp(id: string) {
    if (savingFollowUp) return;
    setSavingFollowUp(true);
    try {
      await postLead({
        action: "follow_up",
        id,
        followUpAt: followUpDraft ? new Date(followUpDraft).toISOString() : null,
      });
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === id
            ? { ...lead, followUpAt: followUpDraft ? new Date(followUpDraft).toISOString() : null }
            : lead,
        ),
      );
      setOpenFollowUpId(null);
      toast.success(followUpDraft ? "زمان پیگیری ذخیره شد." : "زمان پیگیری حذف شد.");
    } catch (error) {
      toast.error(adminErrorMessage(error, "ذخیره زمان پیگیری انجام نشد."));
    } finally {
      setSavingFollowUp(false);
    }
  }

  async function toggleActivities(id: string) {
    if (openActivityId === id) {
      setOpenActivityId(null);
      return;
    }
    setOpenActivityId(id);
    if (activities[id]) return;
    try {
      const response = await postLead({ action: "activities", id });
      const data = await response.json() as { activities?: Array<{ id: number; type: string; title: string; note: string; createdAt: string }> };
      setActivities((prev) => ({ ...prev, [id]: Array.isArray(data.activities) ? data.activities : [] }));
    } catch (error) {
      toast.error(adminErrorMessage(error, "تاریخچه فعالیت‌ها بارگذاری نشد."));
    }
  }

  async function remove(id: string, name: string) {
    const ok = await confirm({
      title: "حذف درخواست",
      description: `درخواست «${name}» برای همیشه حذف می‌شود.`,
      confirmLabel: "حذف دائمی",
      tone: "danger",
    });
    if (!ok) return;
    if (busyId) return;
    setBusyId(id);
    try {
      await postLead({ action: "delete", id });
      toast.success("درخواست حذف شد.");
      await load();
    } catch (error) {
      toast.error(adminErrorMessage(error, "حذف درخواست انجام نشد."));
    } finally {
      setBusyId(null);
    }
  }

  const filteredLeads = leads;


  function budgetWhatsappHref(lead: Lead) {
    const phone = lead.phone
      .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
    const lines = [
      "سلام " + lead.name + "،",
      "نتیجه بررسی بودجه شما از طرف هیرمند:",
      lead.budgetDeposit || lead.budgetDepositMin || lead.budgetDepositMax
        ? "رهن: " + formatBudgetRange(lead.budgetDepositMin, lead.budgetDepositMax, lead.budgetDeposit) + " تومان"
        : "",
      lead.budgetRent || lead.budgetRentMin || lead.budgetRentMax
        ? "اجاره ماهانه: " + formatBudgetRange(lead.budgetRentMin, lead.budgetRentMax, lead.budgetRent) + " تومان"
        : "",
      lead.budgetPurchase || lead.budgetPurchaseMin || lead.budgetPurchaseMax
        ? "بودجه خرید: " + formatBudgetRange(lead.budgetPurchaseMin, lead.budgetPurchaseMax, lead.budgetPurchase) + " تومان"
        : "",
      lead.budgetSale || lead.budgetSaleMin || lead.budgetSaleMax
        ? "بودجه فروش: " + formatBudgetRange(lead.budgetSaleMin, lead.budgetSaleMax, lead.budgetSale) + " تومان"
        : "",
      lead.leaseDeadline && (lead.deal === "رهن" || lead.deal === "اجاره" || lead.deal === "رهن و اجاره")
        ? "مهلت رهن و اجاره: " + formatPersianDate(lead.leaseDeadline)
        : "",
      lead.neighborhood ? "محله: " + lead.neighborhood : "",
      lead.requestedBedrooms != null
        ? "تعداد خواب موردنظر: " + (lead.requestedBedrooms === 0 ? "بدون خواب / استودیو" : lead.requestedBedrooms >= 6 ? "۶ خواب و بیشتر" : lead.requestedBedrooms.toLocaleString("fa-IR") + " خواب")
        : "",
      lead.budgetBedrooms ? "حداقل خواب بودجه‌یابی: " + lead.budgetBedrooms : "",
      "",
      "فایل‌های پیشنهادی:",
      ...lead.matchedProperties.slice(0, 5).map((item, index) =>
        (index + 1) + ". " + item.title + " — " + SITE.url + "/properties/" + item.slug
      ),
      "",
      "برای هماهنگی بازدید با ما در تماس باشید.",
    ].filter(Boolean);
    return (
      "https://wa.me/" +
      (phone.startsWith("0098") ? phone.slice(2) : phone.startsWith("98") ? phone : phone.replace(/^0/, "98")) +
      "?text=" +
      encodeURIComponent(lines.join("\n"))
    );
  }

  async function createOverdueTasks() {
    try {
      const response = await fetch("/api/leads-admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create_overdue_tasks" }) });
      const data = (await response.json().catch(() => null)) as { created?: number; statusMessage?: string } | null;
      if (!response.ok) throw new Error(data?.statusMessage || "ساخت پیگیری خودکار انجام نشد.");
      toast.success(data?.created ? data.created.toLocaleString("fa-IR") + " پیگیری خودکار ساخته شد." : "پیگیری خودکار جدیدی لازم نبود.");
      await load();
    } catch (error) { toast.error(adminErrorMessage(error, "ساخت پیگیری‌های خودکار انجام نشد.")); }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const response = await fetch("/api/leads-admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "export",
          query: query.trim() || undefined,
          status: statusFilter === "all" ? undefined : statusFilter,
        }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as
          | { statusMessage?: string; message?: string }
          | null;
        throw new Error(result?.statusMessage || result?.message || "خروجی CSV آماده نشد.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "hirmand-leads.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("خروجی کامل CRM آماده شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خروجی CSV آماده نشد.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="admin-lead-manager">
      <AdminLead360 leads={leads} />
      <AdminLeadSegments
        query={query}
        status={statusFilter}
        sort={sort}
        onApply={(value) => {
          setQuery(value.query);
          setStatusFilter(value.status as "all" | LeadStatus);
          setSort(value.sort as typeof sort);
        }}
      />
      {confirmDialog}
      <AdminLeadMessageTemplates leads={leads} />
      <AdminLeadAssignmentBalancer />
      <AdminLeadDedupe />
      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <span className="kicker">CRM درخواست‌ها</span>
            <h2>
              {fa(total)} درخواست
              {statusFilter === "all" && !debouncedQuery ? "" : " مطابق فیلتر فعلی"}
            </h2>
          </div>
          <div className="admin-list-toolbar">
            <label className="admin-search">
              <Search size={16} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="جستجوی نام، تلفن، محله، مشاور یا یادداشت…"
                aria-label="جستجوی درخواست‌ها"
              />
            </label>
            <select
              className="admin-lead-status-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | LeadStatus)}
              aria-label="فیلتر وضعیت"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="new">جدید</option>
              <option value="contacted">تماس گرفته شد</option>
              <option value="follow_up">پیگیری</option>
              <option value="visited">بازدید</option>
              <option value="contract">قرارداد</option>
              <option value="closed">ناموفق / بسته‌شده</option>
              <option value="spam">اسپم</option>
            </select>
            <select
              className="admin-lead-status-select"
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
              aria-label="مرتب‌سازی درخواست‌ها"
            >
              <option value="newest">جدیدترین</option>
              <option value="oldest">قدیمی‌ترین</option>
              <option value="name">نام مشتری</option>
              <option value="follow_up">نزدیک‌ترین پیگیری</option>
              <option value="priority">بالاترین اولویت</option>
            </select>
            {!staffMode ? (
              <button type="button" className="btn-ghost" onClick={() => void exportCsv()} disabled={exporting}>
                <Download size={16} />
                {exporting ? "در حال ساخت…" : "خروجی CSV"}
              </button>
            ) : null}
            <button type="button" className="btn-ghost" onClick={() => void createOverdueTasks()}><Clock3 size={16} /> ساخت پیگیری خودکار</button>
            <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={16} className={loading ? "admin-spin" : undefined} />
              به‌روزرسانی
            </button>
          </div>
        </div>

        {loadError ? (
          <div style={{ padding: "14px 20px" }}>
            <AdminErrorBanner
              message={loadError}
              onRetry={() => void load()}
              onDismiss={() => setLoadError(null)}
            />
          </div>
        ) : null}

        {loading && filteredLeads.length === 0 ? (
          <AdminListSkeleton rows={5} />
        ) : total === 0 && !debouncedQuery && statusFilter === "all" ? (
          <div className="admin-empty">
            <UserRound size={30} />
            <strong>هنوز درخواستی ثبت نشده</strong>
            <p>درخواست‌های فرم ملک و بودجه‌یابی اینجا نمایش داده می‌شوند.</p>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="admin-empty">
            <Search size={30} />
            <strong>نتیجه‌ای با این فیلتر پیدا نشد</strong>
            <p>عبارت جستجو یا وضعیت انتخاب‌شده را تغییر دهید.</p>
          </div>
        ) : (
          <div className="admin-lead-list">
            {filteredLeads.map((lead) => (
              <article key={lead.id} className="admin-lead-card">
                <div className="admin-lead-main">
                  <div className="admin-lead-title">
                    <strong>{lead.name}</strong>
                    <span className={"admin-lead-status status-" + lead.status}>
                      {STATUS_LABEL[lead.status]}
                    </span>
                    {lead.source === "budget_match" ? (
                      <span className="admin-lead-budget-badge">بودجه‌یابی</span>
                    ) : null}
                    {(() => { const p = leadPriorityMeta(lead); return <span className={"admin-lead-priority-badge is-" + p.tone}><Flame size={12} /> {p.label} · {lead.priorityScore.toLocaleString("fa-IR")}</span>; })()}
                    {lead.visitStatus !== "none" ? (
                      <span className="admin-lead-budget-badge">{VISIT_STATUS_LABEL[lead.visitStatus]}</span>
                    ) : null}
                  </div>
                  <a className="admin-lead-phone" href={"tel:" + lead.phone}>
                    <Phone size={15} /> {lead.phone}
                  </a>
                  <p>
                    {lead.peopleCount ? "تعداد نفرات: " + lead.peopleCount.toLocaleString("fa-IR") + " · " : ""}
                    {lead.job ? "شغل: " + lead.job + " · " : ""}
                    {lead.deal}
                    {lead.propertyType ? " · " + lead.propertyType : ""}
                    {lead.neighborhood ? " · " + lead.neighborhood : ""}
                    {lead.floorPreference ? " · طبقه: " + lead.floorPreference : ""}
                    {lead.requestedBedrooms != null ? " · خواب: " + (lead.requestedBedrooms === 0 ? "بدون خواب" : lead.requestedBedrooms >= 6 ? "۶+" : lead.requestedBedrooms.toLocaleString("fa-IR")) : ""}
                    {lead.requestedAmenities.length ? " · " + lead.requestedAmenities.length.toLocaleString("fa-IR") + " امکان انتخابی" : ""}
                    {lead.consultant ? " · مشاور: " + lead.consultant : ""}
                  </p>
                  {(lead.budgetDeposit != null ||
                    lead.budgetRent != null ||
                    lead.budgetPurchase != null ||
                    lead.budgetSale != null ||
                    lead.budgetDepositMin != null ||
                    lead.budgetDepositMax != null ||
                    lead.budgetRentMin != null ||
                    lead.budgetRentMax != null ||
                    lead.budgetPurchaseMin != null ||
                    lead.budgetPurchaseMax != null ||
                    lead.budgetSaleMin != null ||
                    lead.budgetSaleMax != null ||
                    lead.budgetEquivalent != null) ? (
                    <div className="admin-lead-budget">
                      {lead.deal === "رهن" || lead.deal === "اجاره" || lead.deal === "رهن و اجاره" ? (
                        <>
                          <div>
                            <span>بازه رهن</span>
                            <strong>{formatBudgetRange(lead.budgetDepositMin, lead.budgetDepositMax, lead.budgetDeposit)}</strong>
                          </div>
                          <div>
                            <span>بازه اجاره</span>
                            <strong>{formatBudgetRange(lead.budgetRentMin, lead.budgetRentMax, lead.budgetRent)}</strong>
                          </div>
                        </>
                      ) : lead.deal === "خرید" ? (
                        <div>
                          <span>بازه مبلغ خرید</span>
                          <strong>{formatBudgetRange(lead.budgetPurchaseMin, lead.budgetPurchaseMax, lead.budgetPurchase)}</strong>
                        </div>
                      ) : lead.deal === "فروش" ? (
                        <div>
                          <span>بازه مبلغ فروش</span>
                          <strong>{formatBudgetRange(lead.budgetSaleMin, lead.budgetSaleMax, lead.budgetSale)}</strong>
                        </div>
                      ) : null}
                      {lead.budgetEquivalent != null ? (
                        <div>
                          <span>معادل رهنی</span>
                          <strong>{lead.budgetEquivalent ? formatToman(lead.budgetEquivalent) : "—"}</strong>
                        </div>
                      ) : null}
                      {lead.matchCount > 0 ? (
                        <div>
                          <span>فایل پیشنهادی</span>
                          <strong>{lead.matchCount.toLocaleString("fa-IR")} مورد</strong>
                        </div>
                      ) : null}
                      {lead.matchedProperties.length ? (
                        <div className="admin-lead-matches">
                          {lead.matchedProperties.slice(0, 5).map((item) => (
                            <a key={item.slug} href={SITE.url + "/properties/" + item.slug} target="_blank" rel="noreferrer">
                              {item.title}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {lead.followUpAt ? (
                    <div className={new Date(lead.followUpAt).getTime() <= Date.now() ? "admin-lead-followup is-due" : "admin-lead-followup"}>
                      پیگیری بعدی: <strong>{formatDate(lead.followUpAt)}</strong>
                    </div>
                  ) : null}
                  <div className="admin-lead-created-at">
                    تاریخ ثبت درخواست: <strong>{formatDate(lead.createdAt)}</strong>
                  </div>
                  {lead.leaseDeadline && (lead.deal === "رهن" || lead.deal === "اجاره" || lead.deal === "رهن و اجاره") ? (
                    (() => {
                      const meta = leaseDeadlineMeta(lead.leaseDeadline);
                      return (
                        <div className={"admin-lead-deadline is-" + meta.tone}>
                          <CalendarDays size={15} aria-hidden="true" />
                          <span>مهلت رهن و اجاره: <strong>{formatPersianDate(lead.leaseDeadline)}</strong></span>
                          {meta.text ? <b>{meta.text}</b> : null}
                        </div>
                      );
                    })()
                  ) : null}
                  {lead.acquisitionSource ? (
                    <div className="admin-lead-attribution">
                      منبع جذب: <strong>{lead.acquisitionSource}</strong>
                      {lead.acquisitionMedium ? " · " + lead.acquisitionMedium : ""}
                      {lead.acquisitionCampaign ? " · کمپین: " + lead.acquisitionCampaign : ""}
                    </div>
                  ) : null}
                  {lead.requestedBedrooms != null ? (
                    <div className="admin-lead-bedroom">
                      خواب موردنظر: <strong>{lead.requestedBedrooms === 0 ? "بدون خواب / استودیو" : lead.requestedBedrooms >= 6 ? "۶ خواب و بیشتر" : lead.requestedBedrooms.toLocaleString("fa-IR") + " خواب"}</strong>
                    </div>
                  ) : null}
                  {lead.requestedAmenities.length ? (
                    <div className="admin-lead-amenities" aria-label="امکانات موردنظر">
                      <span>امکانات:</span>
                      <div>
                        {lead.requestedAmenities.slice(0, 6).map((value) => (
                          <span key={value} className="admin-lead-amenity-chip">{amenityLabel(value)}</span>
                        ))}
                        {lead.requestedAmenities.length > 6 ? (
                          <span className="admin-lead-amenity-more">+{(lead.requestedAmenities.length - 6).toLocaleString("fa-IR")}</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {lead.followUpAt ? (
                    <div className="admin-lead-follow-up">
                      <CalendarDays size={14} />
                      <span>پیگیری بعدی: <strong>{formatDate(lead.followUpAt)}</strong></span>
                    </div>
                  ) : null}
                  {lead.callbackPreferredAt ? (
                    <div className="admin-lead-follow-up admin-lead-callback">
                      <CalendarDays size={14} />
                      <span>تماس پیشنهادی: <strong>{formatDate(lead.callbackPreferredAt)}</strong></span>
                    </div>
                  ) : null}
                  {lead.offerAmount ? (
                    <div className="admin-lead-follow-up admin-lead-offer">
                      <Tag size={14} />
                      <span>پیشنهاد قیمت: <strong>{formatToman(lead.offerAmount)} تومان</strong></span>
                      {lead.offerConditions ? <small>{lead.offerConditions}</small> : null}
                    </div>
                  ) : null}
                  {lead.visitPreferredAt ? (
                    <div className="admin-lead-follow-up">
                      <CalendarDays size={14} />
                      <span>زمان پیشنهادی بازدید: <strong>{formatDate(lead.visitPreferredAt)}</strong></span>
                      <select
                        value={lead.visitStatus}
                        onChange={(event) => void updateVisitStatus(lead.id, event.target.value as VisitStatus)}
                        disabled={busyId === lead.id}
                        aria-label="وضعیت بازدید"
                      >
                        {Object.entries(VISIT_STATUS_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {lead.note ? (
                    <div className="admin-lead-note">
                      <strong>یادداشت: </strong>
                      {lead.note}
                    </div>
                  ) : null}
                  {openNoteId === lead.id ? (
                    <div className="admin-lead-note-editor">
                      <label className="field">
                        <span>یادداشت و پیگیری داخلی این درخواست</span>
                        <textarea
                          rows={4}
                          value={noteDraft}
                          onChange={(event) => setNoteDraft(event.target.value)}
                          placeholder="مثلاً: تماس گرفته شد، منتظر تأیید بودجه از مشتری…"
                        />
                      </label>
                      <div className="admin-lead-note-actions">
                        <button
                          type="button"
                          className="btn-gold"
                          onClick={() => void saveNote(lead.id)}
                          disabled={savingNote}
                        >
                          {savingNote ? "در حال ذخیره…" : "ذخیره یادداشت"}
                        </button>
                        <button type="button" className="btn-ghost" onClick={() => setOpenNoteId(null)}>
                          انصراف
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {openFollowUpId === lead.id ? (
                    <div className="admin-lead-note-editor admin-lead-follow-up-editor">
                      <label className="field">
                        <span>پیگیری بعدی</span>
                        <input
                          type="datetime-local"
                          value={followUpDraft}
                          onChange={(event) => setFollowUpDraft(event.target.value)}
                        />
                      </label>
                      <div className="admin-lead-note-actions">
                        <button type="button" className="btn-gold" onClick={() => void saveFollowUp(lead.id)} disabled={savingFollowUp}>
                          {savingFollowUp ? "در حال ذخیره…" : "ذخیره زمان پیگیری"}
                        </button>
                        <button type="button" className="btn-ghost" onClick={() => setOpenFollowUpId(null)}>انصراف</button>
                      </div>
                    </div>
                  ) : null}
                  <small>ثبت: {formatDate(lead.createdAt)}</small>
                </div>

                {openActivityId === lead.id ? (
                  <div className="admin-lead-activity-timeline">
                    {(activities[lead.id] ?? []).length === 0 ? (
                      <span>هنوز فعالیتی ثبت نشده است.</span>
                    ) : (
                      (activities[lead.id] ?? []).map((item) => (
                        <div key={item.id}>
                          <strong>{item.title}</strong>
                          <small>{new Date(item.createdAt).toLocaleString("fa-IR")}</small>
                          {item.note ? <p>{item.note}</p> : null}
                        </div>
                      ))
                    )}
                  </div>
                ) : null}

                <div className="admin-lead-actions">
                  <a
                    className="admin-icon-btn"
                    href={
                      "https://wa.me/" +
                      (() => {
                        const phone = lead.phone
                          .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
                          .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
                        return phone.startsWith("0098")
                          ? phone.slice(2)
                          : phone.startsWith("98")
                            ? phone
                            : phone.replace(/^0/, "98");
                      })() +
                      "?text=" +
                      encodeURIComponent("سلام، از دفتر هیرمند درباره درخواست شما تماس می‌گیریم.")
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    title="واتساپ"
                  >
                    <ExternalLink size={16} />
                  </a>
                  {lead.source === "budget_match" && lead.matchedProperties.length ? (
                    <a
                      className="admin-icon-btn admin-budget-send"
                      href={budgetWhatsappHref(lead)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="ارسال فایل‌های پیشنهادی"
                    >
                      <MessageCircle size={16} />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="admin-icon-btn"
                    title="زمان‌بندی پیگیری"
                    aria-label={"زمان‌بندی پیگیری برای " + lead.name}
                    onClick={() => {
                      const current = lead.followUpAt ? new Date(lead.followUpAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);
                      const local = new Date(current.getTime() - current.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                      setFollowUpDraft(local);
                      setOpenFollowUpId(lead.id);
                    }}
                  >
                    <CalendarDays size={16} />
                  </button>
                  <button
                    type="button"
                    className="admin-icon-btn"
                    title="تاریخچه فعالیت"
                    aria-label={"تاریخچه فعالیت برای " + lead.name}
                    onClick={() => void toggleActivities(lead.id)}
                  >
                    <Clock3 size={16} />
                  </button>
                  <select
                    className="admin-lead-status-select"
                    value={lead.status}
                    disabled={busyId === lead.id}
                    onChange={(event) => void updateStatus(lead.id, event.target.value as LeadStatus)}
                    aria-label={"وضعیت درخواست " + lead.name}
                  >
                    <option value="new">جدید</option>
                    <option value="contacted">تماس گرفته شد</option>
                    <option value="follow_up">پیگیری</option>
                    <option value="visited">بازدید</option>
                    <option value="contract">قرارداد</option>
                    <option value="closed">ناموفق / بسته‌شده</option>
                    <option value="spam">اسپم</option>
                  </select>
                  <button
                    type="button"
                    className="admin-icon-btn"
                    title="ثبت یادداشت"
                    aria-label={"ثبت یادداشت برای " + lead.name}
                    onClick={() => {
                      setNoteDraft(lead.note ?? "");
                      setOpenNoteId(lead.id);
                    }}
                  >
                    <NotebookPen size={16} />
                  </button>
                  {!staffMode ? (
                    <button
                      type="button"
                      className="admin-icon-btn danger"
                      title="حذف درخواست"
                      aria-label={"حذف درخواست " + lead.name}
                      disabled={busyId === lead.id}
                      onClick={() => void remove(lead.id, lead.name)}
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}

        {total > PAGE_SIZE ? (
          <AdminPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            busy={loading}
            onPageChange={setPage}
          />
        ) : null}
      </section>
    </div>
  );
}
