import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, CircleAlert, MessageCircle, RefreshCw, UserRound, CalendarClock, ImageOff } from "lucide-react";
import { toast } from "sonner";
import {
  listAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  type AdminNotification,
} from "@/lib/admin-notifications";

function formatDate(value: string) {
  return new Date(value).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });
}

function iconFor(kind: string) {
  if (kind === "message") return <MessageCircle size={17} />;
  if (kind === "visit") return <CalendarClock size={17} />;
  if (kind === "property") return <ImageOff size={17} />;
  return <UserRound size={17} />;
}

export function AdminNotificationCenter() {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await listAdminNotifications({ data: { limit: 60 } });
      setItems(result.notifications);
      setUnread(result.unread);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "اعلان‌ها دریافت نشدند.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => items.slice(0, 30), [items]);

  async function markRead(id: number) {
    try {
      await markAdminNotificationRead({ data: { id } });
      setItems((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
      setUnread((current) => Math.max(0, current - 1));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "اعلان خوانده نشد.");
    }
  }

  async function markAll() {
    if (busy || unread === 0) return;
    setBusy(true);
    try {
      await markAllAdminNotificationsRead({ data: {} });
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
      setUnread(0);
      toast.success("همه اعلان‌ها خوانده شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "علامت‌گذاری انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel admin-notification-center" aria-labelledby="admin-notification-title">
      <div className="admin-panel-head">
        <div>
          <span className="kicker">صندوق ورودی</span>
          <h2 id="admin-notification-title"><Bell size={19} /> اعلان‌های مدیریت {unread ? <span className="admin-notification-count">{unread.toLocaleString("fa-IR")}</span> : null}</h2>
        </div>
        <div className="admin-notification-actions">
          <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "admin-spin" : ""} /> تازه‌سازی</button>
          <button type="button" className="btn-ghost" onClick={() => void markAll()} disabled={busy || unread === 0}><CheckCheck size={14} /> خواندن همه</button>
        </div>
      </div>
      {loading ? <div className="admin-empty">در حال دریافت اعلان‌ها…</div> : !visible.length ? (
        <div className="admin-empty"><CircleAlert size={24} /><strong>مورد جدیدی برای رسیدگی نیست.</strong></div>
      ) : (
        <div className="admin-notification-list">
          {visible.map((item) => (
            <article key={item.id} className={"admin-notification-row " + (!item.readAt ? "is-unread " : "") + "severity-" + item.severity}>
              <div className="admin-notification-icon">{iconFor(item.kind)}</div>
              <div className="admin-notification-main">
                <div className="admin-notification-title"><strong>{item.title}</strong><small>{formatDate(item.createdAt)}</small></div>
                <p>{item.body}</p>
              </div>
              {!item.readAt ? <button type="button" className="btn-ghost" onClick={() => void markRead(item.id)}>خواندم</button> : <span className="admin-notification-read">خوانده‌شده</span>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
