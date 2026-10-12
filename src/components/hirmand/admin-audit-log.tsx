import { useEffect, useMemo, useState } from "react";
import { ClipboardList, DatabaseZap, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { clearAdminAuditLog, listAdminAuditLog } from "@/lib/admin-audit";

type AuditRow = Awaited<ReturnType<typeof listAdminAuditLog>>[number];

const ACTION_LABELS: Record<string, string> = {
  "property.created": "ایجاد فایل",
  "property.updated": "ویرایش فایل",
  "property.trashed": "انتقال به سطل",
  "property.bulk_trashed": "انتقال گروهی به سطل",
  "property.bulk_status": "تغییر وضعیت گروهی",
  "property.restored": "بازیابی فایل",
  "property.permanently_deleted": "حذف دائمی فایل",
  "property.schedule_updated": "تغییر زمان‌بندی",
};

const TYPE_LABELS: Record<string, string> = {
  property: "فایل ملک",
  security: "امنیت",
};

export function AdminAuditLog() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [entityType, setEntityType] = useState("");
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setItems(await listAdminAuditLog({ data: { limit: 150, entityType } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "گزارش عملیات دریافت نشد.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [entityType]);

  const types = useMemo(
    () => Array.from(new Set(items.map((item) => item.entityType))).filter(Boolean),
    [items],
  );

  async function cleanOld() {
    setCleaning(true);
    try {
      const result = await clearAdminAuditLog({ data: { beforeDays: 365 } });
      toast.success(
        result.deleted
          ? `${result.deleted.toLocaleString("fa-IR")} رویداد قدیمی پاک شد.`
          : "رویداد قدیمی برای پاک‌سازی پیدا نشد.",
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "پاک‌سازی گزارش انجام نشد.");
    } finally {
      setCleaning(false);
    }
  }

  function metaSummary(row: AuditRow) {
    const metadata = row.metadata as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof metadata.status === "string") parts.push(`وضعیت: ${metadata.status}`);
    if (typeof metadata.fromStatus === "string") parts.push(`وضعیت قبلی: ${metadata.fromStatus}`);
    if (typeof metadata.restoredStatus === "string") parts.push(`وضعیت بازیابی: ${metadata.restoredStatus}`);
    if (typeof metadata.count === "number") parts.push(`${metadata.count.toLocaleString("fa-IR")} مورد`);
    if (typeof metadata.publishAt === "string") parts.push(`شروع: ${new Date(metadata.publishAt).toLocaleString("fa-IR")}`);
    if (typeof metadata.unpublishAt === "string") parts.push(`پایان: ${new Date(metadata.unpublishAt).toLocaleString("fa-IR")}`);
    return parts.join(" · ");
  }

  return (
    <main className="admin-automation-page">
      <section className="admin-panel admin-automation-hero">
        <div className="admin-automation-hero-icon"><ShieldAlert size={30} /></div>
        <div>
          <span className="kicker">ردیابی داخلی</span>
          <h2>گزارش فعالیت مدیر</h2>
          <p>عملیات مهم روی فایل‌ها، زمان‌بندی، بازیابی و حذف در این فهرست ثبت می‌شود تا مشخص باشد چه تغییری انجام شده است.</p>
        </div>
        <div className="admin-audit-hero-actions">
          <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} className={loading ? "admin-spin" : ""} /> بروزرسانی
          </button>
          <button type="button" className="btn-ghost danger" onClick={() => void cleanOld()} disabled={cleaning}>
            <Trash2 size={15} /> {cleaning ? "در حال پاک‌سازی…" : "پاک‌سازی قدیمی‌تر از یک سال"}
          </button>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head admin-automation-toolbar">
          <div>
            <span className="kicker">Audit trail</span>
            <h2>{items.length.toLocaleString("fa-IR")} رویداد اخیر</h2>
          </div>
          <select value={entityType} onChange={(event) => setEntityType(event.target.value)} aria-label="فیلتر نوع رویداد">
            <option value="">همه عملیات</option>
            {types.map((type) => <option key={type} value={type}>{TYPE_LABELS[type] ?? type}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="admin-empty">در حال دریافت لاگ عملیات…</div>
        ) : !items.length ? (
          <div className="admin-empty"><DatabaseZap size={22} /><span>هنوز رویداد مدیریتی ثبت نشده است.</span></div>
        ) : (
          <div className="admin-audit-list">
            {items.map((item) => {
              const detail = metaSummary(item);
              return (
                <article className="admin-audit-row" key={item.id}>
                  <div className="admin-audit-icon"><ClipboardList size={15} /></div>
                  <div className="admin-audit-copy">
                    <strong>{ACTION_LABELS[item.action] ?? item.action}</strong>
                    {item.entityTitle ? <span>{item.entityTitle}</span> : null}
                    {detail ? <small>{detail}</small> : null}
                  </div>
                  <div className="admin-audit-meta">
                    <span>{TYPE_LABELS[item.entityType] ?? item.entityType}</span>
                    <small>{new Date(item.createdAt).toLocaleString("fa-IR")}</small>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
