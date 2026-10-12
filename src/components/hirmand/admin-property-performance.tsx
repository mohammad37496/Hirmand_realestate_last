import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  Heart,
  Lightbulb,
  MessageCircle,
  Phone,
  RefreshCw,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

type PerformanceData = {
  windowDays: number;
  property: {
    id: string;
    slug: string;
    title: string;
    status: string;
    availabilityStatus: string;
    transactionType: string;
    transactionLabel: string;
    propertyType: string;
    propertyTypeLabel: string;
    neighborhood: string;
    areaM2: number | null;
    price: number | null;
    deposit: number | null;
    rent: number | null;
    updatedAt: string;
    publishedAt: string | null;
    contactName: string;
  } | null;
  events: {
    property_view: number;
    property_favorite: number;
    property_share: number;
    property_compare: number;
    call_click: number;
    whatsapp_click: number;
    property_price_watch: number;
    visit_request: number;
    visit_request_click: number;
  };
  uniqueVisitors: number;
  leads: {
    total: number;
    visitRequests: number;
    confirmedVisits: number;
    completedVisits: number;
  };
  conversionRate: number;
  freshness: {
    updatedAt: string | null;
    publishedAt: string | null;
    daysSinceUpdate: number | null;
    daysSincePublish: number | null;
  };
  quality: {
    score: number;
    imageCount: number;
    missing: string[];
  };
  market: {
    comparableCount: number;
    averagePerM2: number;
    minimumPerM2: number;
    maximumPerM2: number;
    currentPerM2: number | null;
    differencePercent: number | null;
    metric: "price" | "rent" | "deposit";
    transactionLabel: string;
    propertyTypeLabel: string;
    neighborhood: string;
  } | null;
  leadSources: Array<{
    source: string;
    medium: string;
    campaign: string;
    leads: number;
  }>;
  recommendations: Array<{
    key: string;
    tone: "urgent" | "watch" | "opportunity" | "info";
    title: string;
    description: string;
    taskTitle: string;
    priority: "normal" | "high" | "urgent";
  }>;
};

function fa(value: number) {
  return value.toLocaleString("fa-IR");
}

function formatCompactMoney(value: number | null) {
  if (!value || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("fa-IR");
}

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

const METRICS = [
  { key: "property_view", label: "بازدید فایل", icon: Eye },
  { key: "property_favorite", label: "ذخیره", icon: Heart },
  { key: "call_click", label: "تماس", icon: Phone },
  { key: "whatsapp_click", label: "واتساپ", icon: MessageCircle },
  { key: "property_share", label: "اشتراک", icon: Share2 },
  { key: "visit_request", label: "درخواست بازدید", icon: CalendarDays },
] as const;

const RECOMMENDATION_TONE: Record<PerformanceData["recommendations"][number]["tone"], string> = {
  urgent: "فوری",
  watch: "نیازمند بررسی",
  opportunity: "فرصت",
  info: "اطلاعات",
};

export function AdminPropertyPerformance({ propertyId }: { propertyId: string }) {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingTask, setCreatingTask] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/admin-property-performance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ propertyId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.statusMessage || payload?.message || "گزارش عملکرد فایل بارگذاری نشد.");
      }
      setData(payload as PerformanceData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "گزارش عملکرد فایل بارگذاری نشد.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createFollowUp(rec: PerformanceData["recommendations"][number]) {
    if (!data?.property || creatingTask) return;
    setCreatingTask(rec.key);
    try {
      const response = await fetch("/api/admin-productivity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "create_task",
          title: rec.taskTitle,
          description: rec.description,
          assignee: data.property.contactName ?? "",
          priority: rec.priority,
          entityType: "property",
          entityId: data.property.id,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.statusMessage || "ثبت پیگیری انجام نشد.");
      }
      toast.success("پیگیری به مرکز بهره‌وری اضافه شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ثبت پیگیری انجام نشد.");
    } finally {
      setCreatingTask(null);
    }
  }

  return (
    <fieldset className="admin-section admin-property-performance">
      <legend>عملکرد و هوش فایل در ۳۰ روز اخیر</legend>
      <div className="admin-property-performance-head">
        <div>
          <span className="kicker">دید، تبدیل و تصمیم‌یار</span>
          <h2>{data?.property?.title ?? "گزارش تعامل فایل"}</h2>
          <p>تعامل کاربران، کیفیت اطلاعات، تازگی فایل و مقایسه با فایل‌های مشابه همین محله در یک نمای مدیریتی.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} className={loading ? "admin-spin" : ""} />
          بروزرسانی
        </button>
      </div>

      {loading && !data ? (
        <div className="admin-property-performance-skeleton" aria-busy="true">
          {Array.from({ length: 8 }, (_, index) => <span key={index} />)}
        </div>
      ) : data ? (
        <>
          <div className="admin-property-performance-grid">
            {METRICS.map(({ key, label, icon: Icon }) => (
              <div className="admin-property-performance-stat" key={key}>
                <span><Icon size={15} />{label}</span>
                <strong>{fa(data.events[key])}</strong>
              </div>
            ))}
            <div className="admin-property-performance-stat is-accent">
              <span><UsersRound size={15} />بازدیدکننده یکتا</span>
              <strong>{fa(data.uniqueVisitors)}</strong>
            </div>
            <div className="admin-property-performance-stat is-accent">
              <span><BarChart3 size={15} />تبدیل بازدید به لید</span>
              <strong>{fa(data.conversionRate)}٪</strong>
            </div>
          </div>

          <div className="admin-property-performance-funnel">
            <div><span>کل لیدهای این فایل</span><strong>{fa(data.leads.total)}</strong></div>
            <div><span>درخواست بازدید</span><strong>{fa(data.leads.visitRequests)}</strong></div>
            <div><span>بازدید تأییدشده</span><strong>{fa(data.leads.confirmedVisits)}</strong></div>
            <div><span>بازدید انجام‌شده</span><strong>{fa(data.leads.completedVisits)}</strong></div>
          </div>

          <div className="admin-property-intelligence-grid">
            <section className="admin-property-intelligence-card">
              <div className="admin-property-intelligence-title">
                <div>
                  <span className="kicker">کیفیت فایل</span>
                  <h3>آمادگی انتشار و نگهداری</h3>
                </div>
                <Sparkles size={18} />
              </div>
              <div className="admin-property-intelligence-score">
                <strong>{fa(data.quality.score)}</strong>
                <span>از ۱۰۰</span>
              </div>
              <div className="admin-property-intelligence-meta">
                <span><strong>{fa(data.quality.imageCount)}</strong> تصویر</span>
                <span><strong>{data.freshness.daysSinceUpdate == null ? "—" : fa(data.freshness.daysSinceUpdate)}</strong> روز از آخرین ویرایش</span>
                <span><strong>{data.freshness.daysSincePublish == null ? "—" : fa(data.freshness.daysSincePublish)}</strong> روز از انتشار</span>
              </div>
              {data.quality.missing.length ? (
                <div className="admin-property-intelligence-missing">
                  {data.quality.missing.map((item) => <span key={item}>{item}</span>)}
                </div>
              ) : (
                <div className="admin-property-intelligence-ok"><CheckCircle2 size={14} /> اطلاعات پایه کامل است.</div>
              )}
            </section>

            <section className="admin-property-intelligence-card">
              <div className="admin-property-intelligence-title">
                <div>
                  <span className="kicker">مقایسه منطقه‌ای</span>
                  <h3>فایل‌های مشابه همین محله</h3>
                </div>
                <Target size={18} />
              </div>
              {data.market ? (
                <>
                  <p className="admin-property-intelligence-copy">
                    مبنا: {fa(data.market.comparableCount)} فایل منتشرشده · {data.market.transactionLabel} · {data.market.propertyTypeLabel} · {data.market.neighborhood}
                  </p>
                  <div className="admin-property-intelligence-market">
                    <div><span>میانگین هر متر</span><strong>{formatCompactMoney(data.market.averagePerM2)}</strong></div>
                    <div><span>فایل فعلی</span><strong>{formatCompactMoney(data.market.currentPerM2)}</strong></div>
                    <div><span>دامنه مشابه‌ها</span><strong>{formatCompactMoney(data.market.minimumPerM2)} تا {formatCompactMoney(data.market.maximumPerM2)}</strong></div>
                  </div>
                  <div className="admin-property-intelligence-diff">
                    {data.market.differencePercent == null ? "برای این فایل متریک قابل مقایسه‌ای ثبت نشده است." : (
                      <>
                        <TrendingUp size={14} />
                        اختلاف فایل فعلی با میانگین مشابه‌ها: <strong>{data.market.differencePercent > 0 ? "+" : ""}{fa(data.market.differencePercent)}٪</strong>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="admin-property-intelligence-empty">برای همین محله و همین نوع معامله/ملک، داده مشابه کافی ثبت نشده است.</div>
              )}
            </section>
          </div>

          <section className="admin-property-intelligence-card admin-property-recommendations">
            <div className="admin-property-intelligence-title">
              <div>
                <span className="kicker">تصمیم‌یار</span>
                <h3>اقدام‌های پیشنهادی برای همین فایل</h3>
              </div>
              <Lightbulb size={18} />
            </div>
            {data.recommendations.length ? (
              <div className="admin-property-recommendation-list">
                {data.recommendations.map((rec) => (
                  <article key={rec.key} className="admin-property-recommendation" data-tone={rec.tone}>
                    <div className="admin-property-recommendation-icon"><AlertTriangle size={16} /></div>
                    <div className="admin-property-recommendation-main">
                      <div className="admin-property-recommendation-head">
                        <strong>{rec.title}</strong>
                        <span>{RECOMMENDATION_TONE[rec.tone]}</span>
                      </div>
                      <p>{rec.description}</p>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => void createFollowUp(rec)}
                      disabled={creatingTask !== null}
                    >
                      {creatingTask === rec.key ? <RefreshCw size={14} className="admin-spin" /> : <ListTodoIcon />}
                      ثبت پیگیری
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="admin-property-intelligence-ok"><CheckCircle2 size={14} /> فعلاً پیشنهاد مدیریتی فعالی برای این فایل وجود ندارد.</div>
            )}
          </section>

          <section className="admin-property-intelligence-card">
            <div className="admin-property-intelligence-title">
              <div>
                <span className="kicker">جذب لید</span>
                <h3>منبع درخواست‌های این فایل</h3>
              </div>
              <BarChart3 size={18} />
            </div>
            {data.leadSources.length ? (
              <div className="admin-property-source-table">
                {data.leadSources.map((item) => (
                  <div className="admin-property-source-row" key={item.source + item.medium + item.campaign}>
                    <div>
                      <strong>{item.source === "direct" ? "مستقیم" : item.source}</strong>
                      <small>{item.medium} · {item.campaign}</small>
                    </div>
                    <span>{fa(item.leads)} لید</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="admin-property-intelligence-empty">در ۳۰ روز اخیر برای این فایل لید قابل انتساب ثبت نشده است.</div>
            )}
          </section>

          <p className="admin-field-help" style={{ marginTop: 12 }}>
            بازه محاسبه: ۳۰ روز گذشته · اختلاف قیمت/متر فقط یک مقایسه داخلی با فایل‌های مشابه منتشرشده است و جایگزین کارشناسی ملک نیست.
            آخرین بروزرسانی: {formatDate(data.freshness.updatedAt)}.
          </p>
        </>
      ) : (
        <div className="admin-empty">گزارش این فایل در دسترس نیست.</div>
      )}
    </fieldset>
  );
}

function ListTodoIcon() {
  return <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>✓</span>;
}
