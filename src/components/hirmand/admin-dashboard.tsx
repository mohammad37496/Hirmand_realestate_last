import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Activity,
  BarChart3,
  Building2,
  Clock3,
  Download,
  Eye,
  Globe2,
  ImageOff,
  Music2,
  Phone,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  UserRound,
  UsersRound,
} from "lucide-react";
import { AdminCardSkeleton, AdminErrorBanner } from "@/components/hirmand/admin-ui";
import { AdminCampaignLinkBuilder } from "@/components/hirmand/admin-campaign-link-builder";
import { AdminCampaignPerformance } from "@/components/hirmand/admin-campaign-performance";
import { AdminActionCenter } from "@/components/hirmand/admin-action-center";
import { AdminSalesControlCenter } from "@/components/hirmand/admin-sales-control-center";
import { AdminPropertyLifecyclePanel } from "@/components/hirmand/admin-property-lifecycle-panel";
import { AdminNeighborhoodDemandRadar } from "@/components/hirmand/admin-neighborhood-demand-radar";
import { AdminCustomerPropertySubmissions } from "@/components/hirmand/admin-customer-property-submissions";
import { AdminAgenda } from "@/components/hirmand/admin-agenda";
import { AdminVisitFeedback } from "@/components/hirmand/admin-visit-feedback";
import { AdminPropertyReports } from "@/components/hirmand/admin-property-reports";
import { AdminPropertyQualityCenter } from "@/components/hirmand/admin-property-quality-center";
import { fa, faBytes } from "@/components/hirmand/admin-ui-utils";
import { hasAdminPermission, type AdminRole } from "@/lib/admin-roles";
import { AdminSmartAlerts } from "@/components/hirmand/admin-smart-alerts";
import { AdminNotificationCenter } from "@/components/hirmand/admin-notification-center";

type LeadStatus = "new" | "contacted" | "follow_up" | "visited" | "contract" | "closed" | "spam";

type DashboardData = {
  properties: {
    total: number;
    published: number;
    draft: number;
    archived: number;
    featured: number;
    withoutImages: number;
    newLast7: number;
    incomplete: number;
  };
  consultants: {
    total: number;
    active: number;
    withFiles: number;
    withLeads: number;
  };
  leads: {
    total: number;
    new: number;
    contacted: number;
    follow_up: number;
    visited: number;
    contract: number;
    closed: number;
    spam: number;
    today: number;
    last7: number;
    last30: number;
  };
  propertyTypes: { type: string; count: number }[];
  leadDays: { day: string; count: number }[];
  music: { total: number; active: number; sizeBytes: number };
  visitors: {
    today: number;
    last7: number;
    last30: number;
    pageviewsToday: number;
    pageviewsLast7: number;
    pageviewsLast30: number;
    activeNow: number;
  };
  visitorDays: {
    day: string;
    uniqueVisitors: number;
    pageviews: number;
  }[];
  topPages: {
    path: string;
    pageviews: number;
    uniqueVisitors: number;
  }[];
  topProperties: {
    slug: string;
    title: string;
    neighborhood: string;
    views: number;
    uniqueViews: number;
    calls: number;
    whatsapp: number;
    favorites: number;
  }[];
  eventStats: {
    event: string;
    count: number;
    uniqueVisitors: number;
  }[];
  visitorSources: {
    source: string;
    campaign: string;
    visitors: number;
  }[];
  consultantPerformance: {
    id: string;
    name: string;
    phone: string;
    active: boolean;
    files: number;
    leads: number;
    contracts: number;
    views: number;
    calls: number;
    whatsapp: number;
  }[];
  leadSla: { overdue: number; newOver4Hours: number };
  followUps: { due: number; next7: number };
  recentLeads: {
    id: string;
    name: string;
    phone: string;
    deal: string;
    neighborhood: string;
    status: LeadStatus;
    createdAt: string;
  }[];
};

const TYPE_LABEL: Record<string, string> = {
  apartment: "آپارتمان",
  villa: "ویلا و باغ",
  office: "اداری",
  heritage: "خانه اصیل",
  land: "زمین",
  commercial: "تجاری",
  other: "سایر",
};

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "جدید",
  contacted: "تماس گرفته شد",
  follow_up: "پیگیری",
  visited: "بازدید",
  contract: "قرارداد",
  closed: "ناموفق / بسته",
  spam: "اسپم",
};

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function tehranDateKey(offset = 0) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const now = new Date();
  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((item) => item.type === "year")?.value);
  const month = Number(parts.find((item) => item.type === "month")?.value);
  const day = Number(parts.find((item) => item.type === "day")?.value);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() - offset);
  return formatter.format(utc);
}

function formatDay(value: string) {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      weekday: "short",
      timeZone: "Asia/Tehran",
    }).format(new Date(value + "T12:00:00+03:30"));
  } catch {
    return value;
  }
}

export function AdminDashboard({
  role,
  onOpenProperties,
  onOpenLeads,
  onOpenProductivity,
  onCreateProperty,
  onOpenDivar,
  onOpenConsultants,
  onOpenPartners,
  onOpenAttendance,
  onOpenMusic,
}: {
  role: AdminRole;
  onOpenProperties: () => void;
  onOpenLeads: () => void;
  onOpenProductivity: () => void;
  onCreateProperty: () => void;
  onOpenDivar: () => void;
  onOpenConsultants: () => void;
  onOpenPartners: () => void;
  onOpenAttendance: () => void;
  onOpenMusic: () => void;
}) {
  const canManageProperties = hasAdminPermission(role, "property.manage");
  const canManageLeads = hasAdminPermission(role, "lead.manage");
  const canManageContent = hasAdminPermission(role, "content.manage");
  const canManageTeam = role === "owner" || role === "manager";
  const canManageDeals = hasAdminPermission(role, "deal.manage");
  const canUseDivar = role === "owner" || role === "manager" || role === "sales";
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/admin-dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as
          | { statusMessage?: string; message?: string }
          | null;
        throw new Error(result?.statusMessage || result?.message || "بارگذاری داشبورد انجام نشد.");
      }
      setData((await response.json()) as DashboardData);
      setLoadError(null);
      setLastUpdated(new Date());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "بارگذاری داشبورد انجام نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const maxLeadDay = useMemo(() => Math.max(1, ...(data?.leadDays.map((item) => item.count) ?? [0])), [data]);
  const maxPropertyType = useMemo(
    () => Math.max(1, ...(data?.propertyTypes.map((item) => item.count) ?? [0])),
    [data],
  );
  const maxVisitorDay = useMemo(
    () => Math.max(1, ...(data?.visitorDays.map((item) => item.uniqueVisitors) ?? [0])),
    [data],
  );

  const last7Days = useMemo(() => {
    const map = new Map((data?.leadDays ?? []).map((item) => [item.day, item.count]));
    return Array.from({ length: 7 }, (_, index) => {
      const key = tehranDateKey(6 - index);
      return { day: key, count: map.get(key) ?? 0 };
    });
  }, [data]);

  const conversion = useMemo(() => {
    const inquiry = data?.eventStats.find((item) => item.event === "inquiry_submit");
    const calls = data?.eventStats.find((item) => item.event === "call_click");
    const whatsapp = data?.eventStats.find((item) => item.event === "whatsapp_click");
    const rate =
      data?.visitors.last30 && inquiry
        ? (inquiry.uniqueVisitors / data.visitors.last30) * 100
        : 0;
    const pagesPerVisitor =
      data?.visitors.last30
        ? data.visitors.pageviewsLast30 / data.visitors.last30
        : 0;
    return {
      inquiryVisitors: inquiry?.uniqueVisitors ?? 0,
      calls: calls?.count ?? 0,
      whatsapp: whatsapp?.count ?? 0,
      rate,
      pagesPerVisitor,
    };
  }, [data]);


  function downloadDailyReport() {
    if (!data) return;
    const rows: string[][] = [
      ["بخش", "شاخص", "مقدار"],
      ["فایل‌ها", "کل فایل‌ها", String(data.properties.total)],
      ["فایل‌ها", "منتشرشده", String(data.properties.published)],
      ["فایل‌ها", "پیش‌نویس", String(data.properties.draft)],
      ["فایل‌ها", "ویژه", String(data.properties.featured)],
      ["فایل‌ها", "بدون تصویر", String(data.properties.withoutImages)],
      ["فایل‌ها", "ناقص", String(data.properties.incomplete)],
      ["لید", "کل ۳۰ روز", String(data.leads.last30)],
      ["لید", "جدید", String(data.leads.new)],
      ["لید", "پیگیری", String(data.leads.follow_up)],
      ["لید", "بازدید", String(data.leads.visited)],
      ["لید", "قرارداد", String(data.leads.contract)],
      ["لید", "پیگیری عقب‌افتاده", String(data.leadSla.overdue)],
      ["لید", "جدید با تأخیر بیش از ۴ ساعت", String(data.leadSla.newOver4Hours)],
      ["سایت", "بازدیدکننده امروز", String(data.visitors.today)],
      ["سایت", "بازدیدکننده ۷ روز", String(data.visitors.last7)],
      ["سایت", "بازدیدکننده ۳۰ روز", String(data.visitors.last30)],
      ["سایت", "نمایش صفحه ۳۰ روز", String(data.visitors.pageviewsLast30)],
      ["سایت", "کلیک تماس", String(conversion.calls)],
      ["سایت", "کلیک واتساپ", String(conversion.whatsapp)],
      ...data.consultantPerformance.map((item) => ["مشاور", item.name + " · لید", String(item.leads)]),
      ...data.consultantPerformance.map((item) => ["مشاور", item.name + " · قرارداد", String(item.contracts)]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "hirmand-گزارش-مدیریتی-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(anchor);
    anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    toast.success("گزارش مدیریتی دانلود شد.");
  }

  if (loading || !data) {
    return (
      <div className="admin-dashboard">
        {loadError ? (
          <div style={{ marginBottom: 16 }}>
            <AdminErrorBanner message={loadError} onRetry={() => void load()} />
          </div>
        ) : null}
        <AdminCardSkeleton count={7} height={92} />
        <div style={{ marginTop: 18 }}>
          <AdminCardSkeleton count={4} height={150} />
        </div>
      </div>
    );
  }

  const stats = [
    { label: "لید بدون تماس بیش از ۲۴ ساعت", value: data.leadSla.overdue, icon: Phone, tone: "red" },
    { label: "لید جدید بالای ۴ ساعت", value: data.leadSla.newOver4Hours, icon: Clock3, tone: "amber" },
    { label: "کل فایل‌ها", value: data.properties.total, icon: Building2, tone: "gold" },
    { label: "بازدید امروز", value: data.visitors.today, icon: Eye, tone: "blue" },
    { label: "فایل‌های منتشرشده", value: data.properties.published, icon: BarChart3, tone: "green" },
    { label: "درخواست‌های جدید", value: data.leads.new, icon: UsersRound, tone: "amber" },
    { label: "لید در ۳۰ روز", value: data.leads.last30, icon: UserRound, tone: "blue" },
    { label: "فایل‌های جدید ۷ روز", value: data.properties.newLast7, icon: Sparkles, tone: "green" },
    { label: "فایل‌های بدون تصویر", value: data.properties.withoutImages, icon: ImageOff, tone: "amber" },
  ] as const;

  const leadStatuses = [
    { key: "new" as const, label: "جدید", value: data.leads.new, tone: "gold" },
    { key: "contacted" as const, label: "تماس گرفته شد", value: data.leads.contacted, tone: "blue" },
    { key: "follow_up" as const, label: "پیگیری", value: data.leads.follow_up, tone: "amber" },
    { key: "visited" as const, label: "بازدید", value: data.leads.visited, tone: "violet" },
    { key: "contract" as const, label: "قرارداد", value: data.leads.contract, tone: "green" },
    { key: "closed" as const, label: "ناموفق / بسته", value: data.leads.closed, tone: "red" },
    { key: "spam" as const, label: "اسپم", value: data.leads.spam, tone: "red" },
  ];

  return (
    <div className="admin-dashboard">
      <style>{`.admin-funnel-row{display:flex;flex-direction:column}`}</style>
      {canManageLeads || canManageProperties ? (
        <AdminSmartAlerts
          followUpsDue={data.followUps.due}
          leadSlaOverdue={data.leadSla.overdue}
          newLeadsOver4Hours={data.leadSla.newOver4Hours}
          propertiesWithoutImages={data.properties.withoutImages}
          incompleteProperties={data.properties.incomplete}
          onOpenLeads={canManageLeads ? onOpenLeads : undefined}
          onOpenProperties={canManageProperties ? onOpenProperties : undefined}
        />
      ) : null}
      {canManageLeads ? <AdminNotificationCenter /> : null}
      {loadError ? (
        <div style={{ marginBottom: 16 }}>
          <AdminErrorBanner message={loadError} onRetry={() => void load()} />
        </div>
      ) : null}
      <div className="admin-dashboard-stats">
        {canManageLeads ? (
          <>
            <button type="button" className="admin-dashboard-stat" data-tone="red" onClick={onOpenLeads}>
              <span className="admin-dashboard-stat-icon"><Phone size={19} /></span>
              <span>
                <small>پیگیری‌های سررسیدشده</small>
                <strong>{data.followUps.due.toLocaleString("fa-IR")}</strong>
              </span>
              <ArrowLeft size={16} />
            </button>
            <div className="admin-dashboard-stat" data-tone="green">
              <span className="admin-dashboard-stat-icon"><RefreshCw size={19} /></span>
              <span>
                <small>پیگیری در ۷ روز آینده</small>
                <strong>{data.followUps.next7.toLocaleString("fa-IR")}</strong>
              </span>
            </div>
          </>
        ) : null}
        {stats.map(({ label, value, icon: Icon, tone }) => {
          const action = label.includes("درخواست") || label.includes("لید")
            ? (canManageLeads ? onOpenLeads : undefined)
            : label.includes("فایل")
              ? (canManageProperties ? onOpenProperties : undefined)
              : undefined;

          return (
            <button
              key={label}
              type="button"
              className="admin-dashboard-stat"
              data-tone={tone}
              onClick={action}
              disabled={!action}
            >
              <span className="admin-dashboard-stat-icon"><Icon size={19} /></span>
              <span>
                <small>{label}</small>
                <strong>{value.toLocaleString("fa-IR")}</strong>
              </span>
              {action ? <ArrowLeft size={16} /> : null}
            </button>
          );
        })}
      </div>

      {canManageLeads ? <AdminAgenda onOpenLeads={onOpenLeads} /> : null}

      {canManageProperties ? <AdminCustomerPropertySubmissions /> : null}
      {canManageProperties ? <AdminPropertyQualityCenter /> : null}

      <section className="admin-dashboard-health" aria-label="سلامت کتابخانه فایل‌ها و تیم">
        <button type="button" className="admin-dashboard-stat" data-tone="red" onClick={onOpenProperties}>
          <span className="admin-dashboard-stat-icon"><ImageOff size={19} /></span>
          <span>
            <small>فایل‌های نیازمند تکمیل</small>
            <strong>{fa(data.properties.incomplete)}</strong>
          </span>
          <ArrowLeft size={16} />
        </button>
        <button type="button" className="admin-dashboard-stat" data-tone="gold" onClick={onOpenProperties}>
          <span className="admin-dashboard-stat-icon"><Star size={19} /></span>
          <span>
            <small>فایل‌های ویژه فعال</small>
            <strong>{fa(data.properties.featured)}</strong>
          </span>
          <ArrowLeft size={16} />
        </button>
        <button type="button" className="admin-dashboard-stat" data-tone="blue" onClick={onOpenConsultants} disabled={!canManageTeam}>
          <span className="admin-dashboard-stat-icon"><UsersRound size={19} /></span>
          <span>
            <small>مشاور فعال</small>
            <strong>
              {fa(data.consultants.active)}
              <em style={{ fontStyle: "normal", fontSize: ".7rem", opacity: .7 }}>
                {" "}از {fa(data.consultants.total)}
              </em>
            </strong>
          </span>
          <ArrowLeft size={16} />
        </button>
        <button type="button" className="admin-dashboard-stat" data-tone="green" onClick={onOpenConsultants} disabled={!canManageTeam}>
          <span className="admin-dashboard-stat-icon"><UserRound size={19} /></span>
          <span>
            <small>مشاور دارای فایل / لید</small>
            <strong>
              {fa(data.consultants.withFiles)} / {fa(data.consultants.withLeads)}
            </strong>
          </span>
          <ArrowLeft size={16} />
        </button>
        <button type="button" className="admin-dashboard-stat" data-tone="amber" onClick={onOpenMusic} disabled={!canManageContent}>
          <span className="admin-dashboard-stat-icon"><Music2 size={19} /></span>
          <span>
            <small>کتابخانه موسیقی</small>
            <strong>
              {fa(data.music.active)}
              <em style={{ fontStyle: "normal", fontSize: ".7rem", opacity: .7 }}>
                {" "}از {fa(data.music.total)} · {faBytes(data.music.sizeBytes)}
              </em>
            </strong>
          </span>
          <ArrowLeft size={16} />
        </button>
        <div className="admin-dashboard-stat" data-tone="blue">
          <span className="admin-dashboard-stat-icon"><Clock3 size={19} /></span>
          <span>
            <small>بازدید ۷ روز اخیر</small>
            <strong>{fa(data.visitors.last7)}</strong>
          </span>
        </div>
      </section>

      <section className="admin-dashboard-quick-actions" aria-label="میانبرهای مدیریتی">
        <div className="admin-dashboard-quick-intro">
          <div>
            <span className="kicker">عملیات سریع</span>
            <h2>از همین‌جا کارهای پرتکرار را انجام بده</h2>
          </div>
          <span className="admin-dashboard-summary">دسترسی یک‌مرحله‌ای به بخش‌های اصلی پنل</span>
        </div>
        <div className="admin-dashboard-quick-grid">
          {canManageProperties ? (
            <button type="button" className="admin-dashboard-quick-card is-primary" onClick={onCreateProperty}>
              <span className="admin-dashboard-quick-icon"><Plus size={18} /></span>
              <span><strong>ثبت فایل جدید</strong><small>ایجاد و انتشار فایل جدید</small></span>
              <ArrowLeft size={15} />
            </button>
          ) : null}
          {canManageLeads ? (
            <button type="button" className="admin-dashboard-quick-card" onClick={onOpenLeads}>
              <span className="admin-dashboard-quick-icon"><UsersRound size={18} /></span>
              <span><strong>پیگیری مشتریان</strong><small>مشاهده لیدها و وضعیت پیگیری</small></span>
              <ArrowLeft size={15} />
            </button>
          ) : null}
          {canUseDivar ? (
            <button type="button" className="admin-dashboard-quick-card" onClick={onOpenDivar}>
              <span className="admin-dashboard-quick-icon"><Globe2 size={18} /></span>
              <span><strong>فایل‌های دیوار</strong><small>بررسی و ورود فایل‌های جدید</small></span>
              <ArrowLeft size={15} />
            </button>
          ) : null}
          {canManageTeam ? (
            <button type="button" className="admin-dashboard-quick-card" onClick={onOpenConsultants}>
              <span className="admin-dashboard-quick-icon"><UserRound size={18} /></span>
              <span><strong>مدیریت مشاوران</strong><small>اعضا، تماس و حساب‌های فعال</small></span>
              <ArrowLeft size={15} />
            </button>
          ) : null}
          {canManageTeam ? (
            <button type="button" className="admin-dashboard-quick-card" onClick={onOpenPartners}>
              <span className="admin-dashboard-quick-icon"><UsersRound size={18} /></span>
              <span><strong>باشگاه همکاران</strong><small>قراردادها، مهرها و کدهای رهگیری</small></span>
              <ArrowLeft size={15} />
            </button>
          ) : null}
          {canManageTeam ? (
            <button type="button" className="admin-dashboard-quick-card" onClick={onOpenAttendance}>
              <span className="admin-dashboard-quick-icon"><Clock3 size={18} /></span>
              <span><strong>حضور و غیاب</strong><small>ثبت ساعت و گزارش عملکرد اعضا</small></span>
              <ArrowLeft size={15} />
            </button>
          ) : null}
          {canManageContent ? (
            <button type="button" className="admin-dashboard-quick-card" onClick={onOpenMusic}>
              <span className="admin-dashboard-quick-icon"><Music2 size={18} /></span>
              <span><strong>موسیقی سایت</strong><small>مدیریت آهنگ‌ها و وضعیت پخش</small></span>
              <ArrowLeft size={15} />
            </button>
          ) : null}
        </div>
      </section>

      <div className="admin-dashboard-grid">
        <section className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <span className="kicker">CRM</span>
              <h2>قیف درخواست‌ها</h2>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="admin-dashboard-summary">
                {lastUpdated ? "آخرین بروزرسانی " + lastUpdated.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }) : "در حال بروزرسانی"}
              </span>
              <button type="button" className="btn-ghost" onClick={downloadDailyReport}><Download size={15} /> گزارش مدیریتی CSV</button>
              <button type="button" className="btn-ghost" onClick={() => void load()}>بروزرسانی</button>
              {canManageLeads ? <button type="button" className="btn-ghost" onClick={onOpenLeads}>مشاهده همه</button> : null}
            </div>
          </div>
          <div className="admin-funnel">
            {leadStatuses.map((item) => (
              <div key={item.key} className="admin-funnel-row">
                <div className="admin-funnel-label">
                  <span>{item.label}</span>
                  <strong>{item.value.toLocaleString("fa-IR")}</strong>
                </div>
                <div className="admin-funnel-track">
                  <span data-tone={item.tone} style={{ width: (data.leads.total ? Math.max(4, (item.value / data.leads.total) * 100) : 4) + "%" }} />
                </div>
              </div>
            ))}
          </div>
          <div className="admin-dashboard-mini-grid">
            <div><span>امروز</span><strong>{data.leads.today.toLocaleString("fa-IR")}</strong></div>
            <div><span>۷ روز اخیر</span><strong>{data.leads.last7.toLocaleString("fa-IR")}</strong></div>
            <div><span>۳۰ روز اخیر</span><strong>{data.leads.last30.toLocaleString("fa-IR")}</strong></div>
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <span className="kicker">موجودی</span>
              <h2>ترکیب فایل‌ها</h2>
            </div>
            <button type="button" className="btn-ghost" onClick={onOpenProperties}>فهرست فایل‌ها</button>
          </div>
          <div className="admin-breakdown">
            {data.propertyTypes.length === 0 ? (
              <div className="admin-empty"><Building2 size={24} /><strong>هنوز فایلی ثبت نشده</strong></div>
            ) : data.propertyTypes.map((item) => (
              <div key={item.type} className="admin-breakdown-row">
                <div><span>{TYPE_LABEL[item.type] ?? item.type}</span><strong>{item.count.toLocaleString("fa-IR")}</strong></div>
                <div className="admin-breakdown-track">
                  <span style={{ width: Math.max(5, (item.count / maxPropertyType) * 100) + "%" }} />
                </div>
              </div>
            ))}
          </div>
          <div className="admin-dashboard-mini-grid">
            <div><span>ویژه</span><strong>{data.properties.featured.toLocaleString("fa-IR")}</strong></div>
            <div><span>پیش‌نویس</span><strong>{data.properties.draft.toLocaleString("fa-IR")}</strong></div>
            <div><span>بایگانی</span><strong>{data.properties.archived.toLocaleString("fa-IR")}</strong></div>
          </div>
        </section>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <span className="kicker">روند</span>
            <h2>ورودی لید در ۷ روز اخیر</h2>
          </div>
          <span className="admin-dashboard-summary">{data.leads.last7.toLocaleString("fa-IR")} درخواست</span>
        </div>
        <div className="admin-lead-chart">
          {last7Days.map((item) => (
            <div key={item.day} className="admin-lead-chart-col">
              <div className="admin-lead-chart-value">{item.count ? item.count.toLocaleString("fa-IR") : "۰"}</div>
              <div className="admin-lead-chart-bar-wrap">
                <span style={{ height: Math.max(item.count ? 12 : 4, (item.count / maxLeadDay) * 100) + "%" }} />
              </div>
              <small>{formatDay(item.day)}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <span className="kicker">آنالیز سایت</span>
            <h2>بازدیدکننده‌های سایت</h2>
          </div>
          <span className="admin-dashboard-summary">
            امروز {data.visitors.today.toLocaleString("fa-IR")} نفر
          </span>
        </div>

        <div className="admin-dashboard-mini-grid">
          <div>
            <span>فعال در ۵ دقیقه اخیر</span>
            <strong>{data.visitors.activeNow.toLocaleString("fa-IR")}</strong>
          </div>
          <div>
            <span>بازدیدکننده امروز</span>
            <strong>{data.visitors.today.toLocaleString("fa-IR")}</strong>
          </div>
          <div>
            <span>بازدیدکننده ۷ روز</span>
            <strong>{data.visitors.last7.toLocaleString("fa-IR")}</strong>
          </div>
          <div>
            <span>بازدیدکننده ۳۰ روز</span>
            <strong>{data.visitors.last30.toLocaleString("fa-IR")}</strong>
          </div>
        </div>

        <div className="admin-dashboard-mini-grid">
          <div>
            <span>نرخ تبدیل به درخواست</span>
            <strong>{conversion.rate.toFixed(1)}٪</strong>
          </div>
          <div>
            <span>کلیک تماس</span>
            <strong>{conversion.calls.toLocaleString("fa-IR")}</strong>
          </div>
          <div>
            <span>کلیک واتساپ</span>
            <strong>{conversion.whatsapp.toLocaleString("fa-IR")}</strong>
          </div>
        </div>

        <div className="admin-dashboard-mini-grid">
          <div>
            <span>نمایش صفحه امروز</span>
            <strong>{data.visitors.pageviewsToday.toLocaleString("fa-IR")}</strong>
          </div>
          <div>
            <span>نمایش صفحه ۷ روز</span>
            <strong>{data.visitors.pageviewsLast7.toLocaleString("fa-IR")}</strong>
          </div>
          <div>
            <span>نمایش صفحه ۳۰ روز</span>
            <strong>{data.visitors.pageviewsLast30.toLocaleString("fa-IR")}</strong>
          </div>
        </div>

        <div className="admin-lead-chart" aria-label="روند بازدیدکننده‌ها در ۱۴ روز اخیر">
          {data.visitorDays.map((item) => (
            <div key={item.day} className="admin-lead-chart-col">
              <div className="admin-lead-chart-value">
                {item.uniqueVisitors.toLocaleString("fa-IR")}
              </div>
              <div className="admin-lead-chart-bar-wrap">
                <span
                  style={{
                    height:
                      Math.max(
                        item.uniqueVisitors ? 12 : 4,
                        (item.uniqueVisitors / maxVisitorDay) * 100,
                      ) + "%",
                  }}
                />
              </div>
              <small>{formatDay(item.day)}</small>
            </div>
          ))}
        </div>

        <p className="admin-dashboard-summary">
          میانگین نمایش صفحه برای هر بازدیدکننده در ۳۰ روز: {conversion.pagesPerVisitor.toFixed(1)} صفحه.
          «بازدیدکننده» بر اساس یک شناسه ناشناس در کوکی همان مرورگر محاسبه می‌شود؛ حذف کوکی یا تعویض مرورگر می‌تواند یک نفر را دوباره به‌عنوان بازدیدکننده جدید ثبت کند.
        </p>
      </section>

      <div className="admin-dashboard-grid">
        <section className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <span className="kicker">فایل‌های محبوب</span>
              <h2>پربازدیدترین فایل‌ها</h2>
            </div>
            <span className="admin-dashboard-summary">۳۰ روز اخیر</span>
          </div>
          <div className="admin-breakdown">
            {data.topProperties.length === 0 ? (
              <div className="admin-empty">
                <Building2 size={24} />
                <strong>هنوز بازدید فایل ثبت نشده</strong>
              </div>
            ) : (
              data.topProperties.map((item) => (
                <div key={item.slug} className="admin-breakdown-row">
                  <div>
                    <span>
                      {item.title}
                      {item.neighborhood ? " · " + item.neighborhood : ""}
                    </span>
                    <strong>{item.views.toLocaleString("fa-IR")}</strong>
                  </div>
                  <small>
                    {item.uniqueViews.toLocaleString("fa-IR")} نفر ·{" "}
                    {item.calls.toLocaleString("fa-IR")} تماس ·{" "}
                    {item.whatsapp.toLocaleString("fa-IR")} واتساپ ·{" "}
                    {item.favorites.toLocaleString("fa-IR")} ذخیره
                  </small>
                  <a
                    href={`/properties/${encodeURIComponent(item.slug)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                  >
                    مشاهده
                  </a>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <span className="kicker">صفحات</span>
              <h2>پربازدیدترین صفحات</h2>
            </div>
            <span className="admin-dashboard-summary">۳۰ روز اخیر</span>
          </div>
          <div className="admin-breakdown">
            {data.topPages.length === 0 ? (
              <div className="admin-empty">
                <BarChart3 size={24} />
                <strong>هنوز داده‌ای ثبت نشده</strong>
              </div>
            ) : (
              data.topPages.map((item) => (
                <div key={item.path} className="admin-breakdown-row">
                  <div>
                    <span dir="ltr">{item.path}</span>
                    <strong>{item.pageviews.toLocaleString("fa-IR")}</strong>
                  </div>
                  <small>
                    {item.uniqueVisitors.toLocaleString("fa-IR")} بازدیدکننده
                  </small>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <span className="kicker">تبدیل</span>
              <h2>اقدام‌های مهم کاربران</h2>
            </div>
            <span className="admin-dashboard-summary">۳۰ روز اخیر</span>
          </div>
          <div className="admin-breakdown">
            {data.eventStats.length === 0 ? (
              <div className="admin-empty">
                <UsersRound size={24} />
                <strong>هنوز رویدادی ثبت نشده</strong>
              </div>
            ) : (
              data.eventStats.map((item) => {
                const labels: Record<string, string> = {
                  call_click: "کلیک تماس",
                  whatsapp_click: "کلیک واتساپ",
                  inquiry_submit: "ثبت درخواست",
                  inquiry_click: "باز کردن فرم درخواست",
                  property_share: "اشتراک فایل",
                  property_favorite: "ذخیره فایل",
                  property_view: "بازدید فایل",
                  property_compare: "افزودن به مقایسه",
                  search_share: "اشتراک جست‌وجو",
                  property_search: "جست‌وجوی فایل",
                };
                return (
                  <div key={item.event} className="admin-breakdown-row">
                    <div>
                      <span>{labels[item.event] ?? item.event}</span>
                      <strong>{item.count.toLocaleString("fa-IR")}</strong>
                    </div>
                    <small>
                      {item.uniqueVisitors.toLocaleString("fa-IR")} نفر
                    </small>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {canManageLeads ? <AdminActionCenter onOpenProperties={onOpenProperties} onOpenLeads={onOpenLeads} onOpenProductivity={onOpenProductivity} /> : null}

      <AdminCampaignLinkBuilder />

      <AdminCampaignPerformance />

      <AdminNeighborhoodDemandRadar />

      {canManageProperties ? <AdminPropertyReports /> : null}

      {canManageLeads ? <AdminVisitFeedback /> : null}

      {canManageProperties ? <div style={{ marginTop: 18 }}><AdminPropertyLifecyclePanel /></div> : null}

      {canManageDeals ? <AdminSalesControlCenter onOpenLeads={onOpenLeads} onOpenProperties={onOpenProperties} /> : null}

      <div className="admin-dashboard-grid">
        <section className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <span className="kicker">جذب</span>
              <h2>منابع ورود بازدیدکنندگان</h2>
            </div>
            <span className="admin-dashboard-summary">۳۰ روز اخیر</span>
          </div>
          <div className="admin-dashboard-source-list">
            {data.visitorSources.length === 0 ? (
              <div className="admin-empty"><Globe2 size={24} /><strong>هنوز منبع ورودی ثبت نشده</strong></div>
            ) : (
              data.visitorSources.slice(0, 6).map((item) => (
                <div key={item.source + "::" + item.campaign} className="admin-dashboard-source-row">
                  <div>
                    <strong>{item.source || "مستقیم"}</strong>
                    <small>{item.campaign ? "کمپین: " + item.campaign : "بدون کمپین مشخص"}</small>
                  </div>
                  <span>{item.visitors.toLocaleString("fa-IR")} نفر</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <span className="kicker">وضعیت سیستم</span>
              <h2>سلامت بخش‌های مدیریتی</h2>
            </div>
            <span className="admin-system-status"><Activity size={13} /> فعال</span>
          </div>
          <div className="admin-system-grid">
            <div>
              <span><Building2 size={14} /> فایل‌ها</span>
              <strong>{data.properties.total.toLocaleString("fa-IR")}</strong>
              <small>{data.properties.published.toLocaleString("fa-IR")} منتشرشده</small>
            </div>
            <div>
              <span><Music2 size={14} /> موسیقی</span>
              <strong>{data.music.active.toLocaleString("fa-IR")}</strong>
              <small>از {data.music.total.toLocaleString("fa-IR")} قطعه فعال</small>
            </div>
            <div>
              <span><UsersRound size={14} /> لید جدید</span>
              <strong>{data.leads.new.toLocaleString("fa-IR")}</strong>
              <small>نیازمند بررسی</small>
            </div>
          </div>
        </section>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <span className="kicker">پیگیری</span>
            <h2>آخرین درخواست‌ها</h2>
          </div>
          {canManageLeads ? <button type="button" className="btn-ghost" onClick={onOpenLeads}>مدیریت CRM</button> : null}
        </div>
        {data.recentLeads.length === 0 ? (
          <div className="admin-empty">
            <UsersRound size={26} />
            <strong>هنوز لید جدیدی ندارید</strong>
            <p>درخواست‌های فرم سایت در این بخش نمایش داده می‌شوند.</p>
          </div>
        ) : (
          <div className="admin-recent-leads">
            {data.recentLeads.map((lead) => (
              <article key={lead.id} className="admin-recent-lead">
                <div className="admin-recent-lead-icon"><UserRound size={17} /></div>
                <div className="admin-recent-lead-main">
                  <div className="admin-recent-lead-title">
                    <strong>{lead.name}</strong>
                    <span className={"admin-lead-status status-" + lead.status}>{STATUS_LABEL[lead.status]}</span>
                  </div>
                  <small>
                    {lead.deal}
                    {lead.neighborhood ? " · " + lead.neighborhood : ""}
                    {" · " + formatDate(lead.createdAt)}
                  </small>
                </div>
                <a className="admin-icon-btn" href={"tel:" + lead.phone} title="تماس">
                  <Phone size={16} />
                </a>
              </article>
            ))}
          </div>
        )}
      </section>


    </div>
  );
}
