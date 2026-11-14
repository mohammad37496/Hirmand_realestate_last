import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarClock,
  CheckCheck,
  CircleAlert,
  ExternalLink,
  FileCheck2,
  MessageCircle,
  RefreshCw,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  dismissAdminNotification,
  listAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  type AdminNotification,
} from "@/lib/admin-notifications";

type Props = {
  onOpenLeads?: () => void;
  onOpenMessages?: () => void;
  onOpenProperties?: () => void;
  onOpenDeals?: () => void;
  onOpenDivar?: () => void;
  onOpenIntegrity?: () => void;
  onOpenBackup?: () => void;
};

type Filter = "all" | "unread";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "زمان نامشخص"
    : date.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });
}

function iconFor(kind: string) {
  if (kind === "message") return <MessageCircle size={17} />;
  if (kind === "visit") return <CalendarClock size={17} />;
  if (kind === "property" || kind === "property_change" || kind === "property_report") return <Building2 size={17} />;
  if (kind === "publication" || kind === "deal_document" || kind === "submission") return <FileCheck2 size={17} />;
  if (kind === "divar" || kind === "system" || kind === "backup") return <AlertTriangle size={17} />;
  return <UserRound size={17} />;
}

function anchorFor(item: AdminNotification) {
  if (item.kind === "submission") return "#admin-customer-property-submissions";
  if (item.kind === "publication") return "#admin-publication-queue";
  if (item.entityType === "property" && item.entitySlug) return "/properties/" + encodeURIComponent(item.entitySlug);
  return null;
}

function actionFor(item: AdminNotification, props: Props) {
  if (item.kind === "message") return props.onOpenMessages;
  if (item.kind === "deal_document") return props.onOpenDeals;
  if (item.kind === "divar") return props.onOpenDivar;
  if (item.kind === "system") return props.onOpenIntegrity;
  if (item.kind === "backup") return props.onOpenBackup;
  if (item.entityType === "lead") return props.onOpenLeads;
  if (item.entityType === "property") return props.onOpenProperties;
  return undefined;
}

export function AdminNotificationCenter(props: Props) {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const requestId = useRef(0);
  const inFlight = useRef(false);
  const mutationVersion = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const currentRequest = ++requestId.current;
    const currentMutationVersion = mutationVersion.current;
    if (!silent) setLoading(true);
    try {
      const result = await listAdminNotifications({ data: { limit: 100 } });
      if (currentRequest !== requestId.current || currentMutationVersion !== mutationVersion.current) return;
      setItems(result.notifications);
      setUnread(result.unread);
      setLoadError(null);
      setLastUpdated(new Date().toISOString());
    } catch (error) {
      if (currentRequest !== requestId.current || currentMutationVersion !== mutationVersion.current) return;
      setLoadError(error instanceof Error ? error.message : "دریافت اعلان‌ها ناموفق بود.");
    } finally {
      if (currentRequest === requestId.current) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      requestId.current += 1;
      inFlight.current = false;
    };
  }, [load]);

  const visible = useMemo(
    () => filter === "unread" ? items.filter((item) => !item.readAt) : items,
    [filter, items],
  );

  async function markRead(id: number) {
    if (busyId === id) return;
    setBusyId(id);
    try {
      await markAdminNotificationRead({ data: { id } });
      mutationVersion.current += 1;
      setItems((current) => current.map((item) => item.id === id
        ? { ...item, readAt: new Date().toISOString() }
        : item));
      setUnread((current) => Math.max(0, current - 1));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "اعلان خوانده نشد.");
    } finally {
      setBusyId(null);
    }
  }

  async function markAll() {
    if (busy || unread === 0) return;
    setBusy(true);
    try {
      await markAllAdminNotificationsRead({ data: {} });
      mutationVersion.current += 1;
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
      setUnread(0);
      toast.success("همه اعلان‌های قابل‌دسترسی خوانده شدند.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "علامت‌گذاری اعلان‌ها انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(id: number) {
    if (busyId === id) return;
    const item = items.find((entry) => entry.id === id);
    setBusyId(id);
    try {
      await dismissAdminNotification({ data: { id } });
      mutationVersion.current += 1;
      setItems((current) => current.filter((entry) => entry.id !== id));
      if (item && !item.readAt) setUnread((current) => Math.max(0, current - 1));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بستن اعلان انجام نشد.");
    } finally {
      setBusyId(null);
    }
  }

  function markBeforeOpen(item: AdminNotification) {
    if (!item.readAt) void markRead(item.id);
  }

  return (
    <section id="admin-notification-center" className="admin-panel admin-notification-center" aria-labelledby="admin-notification-title">
      <div className="admin-panel-head">
        <div>
          <span className="kicker">صندوق ورودی</span>
          <h2 id="admin-notification-title">
            <Bell size={19} /> اعلان‌های مدیریت
            <span className="admin-notification-count" aria-live="polite" aria-label={`${unread} اعلان خوانده‌نشده`}>
              {unread.toLocaleString("fa-IR")}
            </span>
          </h2>
          {lastUpdated ? <p className="admin-notification-updated">آخرین به‌روزرسانی: {formatDate(lastUpdated)} · به‌روزرسانی خودکار هر ۳۰ ثانیه</p> : null}
        </div>
        <div className="admin-notification-actions">
          <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "admin-spin" : ""} /> تازه‌سازی
          </button>
          <button type="button" className="btn-ghost" onClick={() => void markAll()} disabled={busy || unread === 0}>
            <CheckCheck size={14} /> خواندن همه
          </button>
        </div>
      </div>

      <div className="admin-notification-toolbar">
        <div className="admin-notification-filters" role="group" aria-label="فیلتر اعلان‌ها">
          <button type="button" aria-pressed={filter === "all"} className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>
            همه ({items.length.toLocaleString("fa-IR")})
          </button>
          <button type="button" aria-pressed={filter === "unread"} className={filter === "unread" ? "is-active" : ""} onClick={() => setFilter("unread")}>
            خوانده‌نشده ({unread.toLocaleString("fa-IR")})
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="admin-empty admin-notification-error" role="alert">
          <CircleAlert size={18} />
          <span>به‌روزرسانی صندوق اعلان‌ها ناموفق بود. {items.length ? "آخرین اطلاعات دریافت‌شده حفظ شده است." : "وضعیت صندوق نامشخص است."}</span>
          <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}>تلاش دوباره</button>
        </div>
      ) : null}

      {loading && !items.length && !loadError ? <div className="admin-empty" role="status">در حال دریافت اعلان‌ها…</div> : null}
      {!loading && !loadError && !visible.length ? (
        <div className="admin-empty admin-notification-empty">
          <CircleAlert size={24} />
          <strong>{filter === "unread" ? "اعلان خوانده‌نشده‌ای ندارید." : "موردی برای رسیدگی وجود ندارد."}</strong>
        </div>
      ) : null}

      {visible.length ? (
        <div className="admin-notification-list">
          {visible.map((item) => {
            const href = anchorFor(item);
            const action = actionFor(item, props);
            return (
              <article key={item.id} className={`admin-notification-row ${!item.readAt ? "is-unread " : ""}severity-${item.severity}`}>
                <div className="admin-notification-icon" aria-hidden="true">{iconFor(item.kind)}</div>
                <div className="admin-notification-main">
                  <div className="admin-notification-title">
                    <strong>{item.title}</strong>
                    <small>{formatDate(item.createdAt)}</small>
                  </div>
                  <p>{item.body}</p>
                  <div className="admin-notification-row-actions">
                    {href ? (
                      <a className="btn-ghost" href={href} target={href.startsWith("/properties/") ? "_blank" : undefined}
                        rel={href.startsWith("/properties/") ? "noreferrer" : undefined} onClick={() => markBeforeOpen(item)}>
                        {href.startsWith("/properties/") ? <ExternalLink size={13} /> : <Building2 size={13} />}
                        مشاهده پرونده
                      </a>
                    ) : action ? (
                      <button type="button" className="btn-ghost" onClick={() => { markBeforeOpen(item); action(); }}>
                        باز کردن بخش مرتبط <ExternalLink size={13} />
                      </button>
                    ) : null}
                    {!item.readAt ? (
                      <button type="button" className="btn-ghost" disabled={busyId === item.id} onClick={() => void markRead(item.id)}>
                        خواندم
                      </button>
                    ) : <span className="admin-notification-read">خوانده‌شده</span>}
                    <button type="button" className="admin-notification-dismiss" aria-label={`بستن اعلان ${item.title}`}
                      title="بستن اعلان" disabled={busyId === item.id} onClick={() => void dismiss(item.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
