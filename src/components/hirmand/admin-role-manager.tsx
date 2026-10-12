import { useEffect, useState } from "react";
import { KeyRound, Lock, Plus, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  createAdminAccount,
  listAdminAccounts,
  resetAdminAccountPassword,
  setAdminAccountActive,
  type AdminAccountSummary,
} from "@/lib/admin-accounts";
import { ADMIN_ROLE_LABELS, type AdminRole } from "@/lib/admin-roles";

const ROLE_OPTIONS: AdminRole[] = ["manager", "sales", "staff", "content", "viewer", "owner"];

export function AdminRoleManager() {
  const [accounts, setAccounts] = useState<AdminAccountSummary[]>([]);
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: "", displayName: "", password: "", role: "sales" as AdminRole });

  async function load() {
    setLoading(true);
    try {
      const result = await listAdminAccounts({ data: {} });
      setAccounts(result.accounts);
      setCurrentAccountId(result.currentAccountId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "حساب‌های مدیران دریافت نشد.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function create() {
    if (!form.username || !form.displayName || !form.password) {
      toast.error("نام کاربری، نام نمایشی و رمز عبور را کامل کنید.");
      return;
    }
    setBusy("create");
    try {
      await createAdminAccount({ data: form });
      toast.success(form.role === "staff" ? "حساب کارمند ساخته شد." : "حساب مدیر ساخته شد.");
      setForm({ username: "", displayName: "", password: "", role: "sales" });
      setShowForm(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ساخت حساب انجام نشد.");
    } finally {
      setBusy("");
    }
  }

  async function toggle(account: AdminAccountSummary) {
    setBusy(account.id);
    try {
      await setAdminAccountActive({ data: { id: account.id, active: !account.isActive } });
      await load();
      toast.success(account.isActive ? "حساب غیرفعال شد." : "حساب فعال شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تغییر وضعیت حساب انجام نشد.");
    } finally {
      setBusy("");
    }
  }

  async function resetPassword(account: AdminAccountSummary) {
    const password = window.prompt("رمز عبور جدید را وارد کنید (حداقل ۱۰ کاراکتر):", "");
    if (!password) return;
    setBusy("password:" + account.id);
    try {
      await resetAdminAccountPassword({ data: { id: account.id, password } });
      toast.success("رمز عبور حساب تغییر کرد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تغییر رمز انجام نشد.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="admin-panel admin-role-manager">
      <div className="admin-panel-head">
        <div>
          <span className="kicker">دسترسی‌ها</span>
          <h2><ShieldCheck size={19} /> حساب‌ها و نقش‌های مدیران</h2>
          <p className="admin-dashboard-summary">ورود با کلید اصلی همچنان به‌عنوان «مالک سیستم» فعال است؛ حساب‌های جداگانه امکان تفکیک دسترسی و لغو هر اپراتور را می‌دهند.</p>
        </div>
        <button type="button" className="btn-gold" onClick={() => setShowForm((value) => !value)}><Plus size={15} /> حساب جدید</button>
      </div>

      {showForm ? (
        <div className="admin-role-form">
          <label className="field"><span>نام کاربری</span><input dir="ltr" value={form.username} onChange={(e) => setForm((c) => ({ ...c, username: e.target.value }))} placeholder="operator01" /></label>
          <label className="field"><span>نام نمایشی</span><input value={form.displayName} onChange={(e) => setForm((c) => ({ ...c, displayName: e.target.value }))} placeholder="مثلاً علی رضایی" /></label>
          <label className="field"><span>رمز عبور</span><input type="password" dir="ltr" value={form.password} onChange={(e) => setForm((c) => ({ ...c, password: e.target.value }))} placeholder="حداقل ۱۰ کاراکتر" /></label>
          <label className="field"><span>نقش</span><select value={form.role} onChange={(e) => setForm((c) => ({ ...c, role: e.target.value as AdminRole }))}>{ROLE_OPTIONS.map((role) => <option key={role} value={role}>{ADMIN_ROLE_LABELS[role]}</option>)}</select></label>
          <div className="admin-role-form-actions"><button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>انصراف</button><button type="button" className="btn-gold" disabled={busy === "create"} onClick={() => void create()}>{busy === "create" ? "در حال ساخت…" : "ساخت حساب"}</button></div>
        </div>
      ) : null}

      {loading ? <div className="admin-empty">در حال بارگذاری حساب‌ها…</div> : !accounts.length ? (
        <div className="admin-empty"><UserRound size={24} /><strong>هنوز حساب مستقلی ساخته نشده است.</strong><p>برای هر عضو تیم یک حساب جدا بسازید تا نام کاربری و سطح دسترسی مشخص باشد.</p></div>
      ) : (
        <div className="admin-role-list">
          {accounts.map((account) => (
            <article key={account.id} className={"admin-role-row " + (!account.isActive ? "is-disabled" : "")}>
              <div className="admin-role-avatar"><UserRound size={18} /></div>
              <div className="admin-role-main">
                <div className="admin-role-title"><strong>{account.displayName}</strong>{currentAccountId === account.id ? <span className="admin-role-current">این حساب</span> : null}</div>
                <small dir="ltr">@{account.username}</small>
                <div className="admin-role-meta"><span>{ADMIN_ROLE_LABELS[account.role]}</span><span>{account.isActive ? "فعال" : "غیرفعال"}</span>{account.lastLoginAt ? <span>آخرین ورود: {new Date(account.lastLoginAt).toLocaleString("fa-IR")}</span> : <span>هنوز وارد نشده</span>}</div>
              </div>
              <div className="admin-role-actions">
                <button type="button" className="btn-ghost" disabled={!!busy || currentAccountId === account.id} onClick={() => void toggle(account)}><Lock size={14} />{account.isActive ? "غیرفعال" : "فعال"}</button>
                <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => void resetPassword(account)}><KeyRound size={14} />{busy === "password:" + account.id ? "در حال تغییر…" : "تغییر رمز"}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
