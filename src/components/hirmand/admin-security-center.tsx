import { useEffect, useState } from "react";
import { Monitor, RefreshCw, ShieldAlert, ShieldCheck, Smartphone, LogOut } from "lucide-react";
import { toast } from "sonner";
import { AdminRoleManager } from "@/components/hirmand/admin-role-manager";
import {
  listAdminSecuritySessions,
  purgeExpiredAdminSessions,
  revokeAdminSessionById,
  revokeOtherAdminSessions,
  type AdminSecuritySession,
} from "@/lib/admin-security";

function formatDate(value: string) {
  return new Date(value).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });
}

function browserLabel(userAgent: string) {
  if (/Edg/i.test(userAgent)) return "Microsoft Edge";
  if (/Chrome/i.test(userAgent)) return "Google Chrome";
  if (/Firefox/i.test(userAgent)) return "Firefox";
  if (/Safari/i.test(userAgent)) return "Safari";
  return "مرورگر وب";
}

function deviceIcon(userAgent: string) {
  return /Mobile|Android|iPhone|iPad/i.test(userAgent) ? <Smartphone size={18} /> : <Monitor size={18} />;
}

export function AdminSecurityCenter() {
  const [sessions, setSessions] = useState<AdminSecuritySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await listAdminSecuritySessions({ data: { limit: 50 } });
      setSessions(data.sessions);
      setCurrentSessionId(data.currentSessionId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فهرست نشست‌ها دریافت نشد.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function revoke(id: string) {
    setBusy(id);
    try {
      await revokeAdminSessionById({ data: { sessionId: id } });
      setSessions((current) => current.map((item) => item.id === id ? { ...item, revokedAt: new Date().toISOString() } : item));
      toast.success("نشست بسته شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بستن نشست انجام نشد.");
    } finally {
      setBusy("");
    }
  }

  async function revokeOthers() {
    setBusy("others");
    try {
      const result = await revokeOtherAdminSessions({ data: {} });
      toast.success(`${result.revoked.toLocaleString("fa-IR")} نشست دیگر بسته شد.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بستن نشست‌های دیگر انجام نشد.");
    } finally {
      setBusy("");
    }
  }

  async function purge() {
    setBusy("purge");
    try {
      const result = await purgeExpiredAdminSessions({ data: {} });
      toast.success(`${result.deleted.toLocaleString("fa-IR")} نشست منقضی قدیمی پاک شد.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "پاک‌سازی نشست‌های قدیمی انجام نشد.");
    } finally {
      setBusy("");
    }
  }

  const active = sessions.filter((item) => !item.revokedAt && new Date(item.expiresAt).getTime() > Date.now());
  const closed = sessions.filter((item) => item.revokedAt || new Date(item.expiresAt).getTime() <= Date.now());

  return (
    <main className="admin-security-page">
      <section className="admin-security-hero admin-panel">
        <div className="admin-security-hero-icon"><ShieldCheck size={30} /></div>
        <div>
          <span className="kicker">امنیت پنل</span>
          <h2>نشست‌های فعال مدیر</h2>
          <p>هر ورود یک نشست مستقل دارد؛ می‌توانید نشست‌های دستگاه‌های دیگر را ببینید و بدون تغییر کلید اصلی آن‌ها را ببندید.</p>
        </div>
        <div className="admin-security-actions">
          <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading || !!busy}><RefreshCw size={15} className={loading ? "admin-spin" : ""} /> تازه‌سازی</button>
          <button type="button" className="btn-ghost" onClick={() => void purge()} disabled={!!busy}><ShieldAlert size={15} /> پاک‌سازی قدیمی</button>
          <button type="button" className="btn-gold" onClick={() => void revokeOthers()} disabled={!!busy}><LogOut size={15} /> بستن نشست‌های دیگر</button>
        </div>
      </section>

      <section className="admin-security-stats">
        <article><span>نشست فعال</span><strong>{active.length.toLocaleString("fa-IR")}</strong><small>در ۳۰ روز اخیر</small></article>
        <article><span>نشست بسته/منقضی</span><strong>{closed.length.toLocaleString("fa-IR")}</strong><small>سوابق نگهداری‌شده</small></article>
        <article><span>نشست فعلی</span><strong>{currentSessionId ? "فعال" : "قدیمی"}</strong><small>{currentSessionId ? "قابل شناسایی و مدیریت" : "ورود قبلی قبل از فعال‌سازی این قابلیت"}</small></article>
      </section>

      <section className="admin-panel admin-security-list">
        <div className="admin-panel-head">
          <div><span className="kicker">ردپای ورود</span><h2>دستگاه‌ها و مرورگرهای اخیر</h2></div>
          <span className="admin-dashboard-summary">{sessions.length.toLocaleString("fa-IR")} رکورد</span>
        </div>
        {loading ? <div className="admin-security-empty">در حال دریافت نشست‌ها…</div> : !sessions.length ? (
          <div className="admin-security-empty">هنوز نشست ذخیره‌شده‌ای وجود ندارد. نشست بعدی هنگام ورود ثبت می‌شود.</div>
        ) : (
          <div className="admin-security-rows">
            {sessions.map((item) => {
              const isActive = !item.revokedAt && new Date(item.expiresAt).getTime() > Date.now();
              return (
                <article key={item.id} className={"admin-security-row" + (item.isCurrent ? " is-current" : "")}>
                  <div className="admin-security-device">{deviceIcon(item.userAgent)}</div>
                  <div className="admin-security-main">
                    <div className="admin-security-title">
                      <strong>{browserLabel(item.userAgent)}</strong>
                      {item.isCurrent ? <span className="admin-security-current">این دستگاه</span> : null}
                      <span className={isActive ? "admin-security-status is-active" : "admin-security-status"}>{isActive ? "فعال" : item.revokedAt ? "بسته‌شده" : "منقضی"}</span>
                    </div>
                    <p>{item.userAgent || "اطلاعات مرورگر در دسترس نیست."}</p>
                    <small>ایجاد: {formatDate(item.createdAt)} · آخرین فعالیت: {formatDate(item.lastSeenAt)} · انقضا: {formatDate(item.expiresAt)}</small>
                  </div>
                  <div className="admin-security-row-actions">
                    {!item.isCurrent && isActive ? <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => void revoke(item.id)}>{busy === item.id ? "در حال بستن…" : "بستن نشست"}</button> : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <AdminRoleManager />
    </main>
  );
}
