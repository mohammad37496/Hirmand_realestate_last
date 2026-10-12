import { useEffect, useState } from "react";
import { ArchiveRestore, AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listAdminTrashProperties,
  permanentlyDeleteProperty,
  restoreDeletedProperty,
  type Property,
} from "@/lib/properties";

export function AdminTrashManager() {
  const [items, setItems] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setItems(await listAdminTrashProperties({ data: { limit: 120 } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "سطل بازیابی دریافت نشد.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function restore(item: Property) {
    setBusyId(item.id);
    try {
      await restoreDeletedProperty({ data: { id: item.id } });
      toast.success(`«${item.title}» بازیابی شد.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بازیابی فایل انجام نشد.");
    } finally {
      setBusyId(null);
    }
  }

  async function erase(item: Property) {
    const ok = window.confirm(`فایل «${item.title}» برای همیشه حذف می‌شود و رسانه‌های آن هم پاک خواهند شد. ادامه می‌دهید؟`);
    if (!ok) return;
    setBusyId(item.id);
    try {
      await permanentlyDeleteProperty({ data: { id: item.id } });
      toast.success("فایل برای همیشه حذف شد.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "حذف دائمی انجام نشد.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="admin-automation-page">
      <section className="admin-panel admin-automation-hero">
        <div className="admin-automation-hero-icon"><ArchiveRestore size={30} /></div>
        <div>
          <span className="kicker">امنیت عملیات</span>
          <h2>سطل بازیابی فایل‌ها</h2>
          <p>حذف فایل از فهرست عادی دیگر فوری و غیرقابل‌برگشت نیست. فایل تا زمان حذف دائمی در اینجا نگه داشته می‌شود و رسانه‌هایش هم حفظ می‌شوند.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading || Boolean(busyId)}>
          <RefreshCw size={15} className={loading ? "admin-spin" : ""} /> بروزرسانی
        </button>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <span className="kicker">بازیابی</span>
            <h2>{items.length.toLocaleString("fa-IR")} فایل حذف‌شده</h2>
          </div>
        </div>

        {loading ? (
          <div className="admin-empty">در حال بررسی سطل بازیابی…</div>
        ) : !items.length ? (
          <div className="admin-empty">
            <ArchiveRestore size={22} />
            <span>سطل بازیابی خالی است.</span>
          </div>
        ) : (
          <div className="admin-trash-list">
            {items.map((item) => (
              <article className="admin-trash-row" key={item.id}>
                <div className="admin-trash-copy">
                  <strong>{item.title}</strong>
                  <span dir="ltr">{item.id.slice(-8).toUpperCase()}</span>
                  <small>
                    حذف‌شده در{" "}
                    {item.deletedAt
                      ? new Date(item.deletedAt).toLocaleString("fa-IR")
                      : "زمان نامشخص"}{" "}
                    · وضعیت قبلی:{" "}
                    {item.deletedFromStatus === "published"
                      ? "منتشرشده"
                      : item.deletedFromStatus === "archived"
                        ? "بایگانی"
                        : "پیش‌نویس"}
                  </small>
                </div>
                <div className="admin-trash-actions">
                  <button type="button" className="btn-gold" onClick={() => void restore(item)} disabled={busyId === item.id}>
                    {busyId === item.id ? <RefreshCw size={14} className="admin-spin" /> : <ArchiveRestore size={14} />}
                    بازیابی
                  </button>
                  <button type="button" className="btn-ghost danger" onClick={() => void erase(item)} disabled={busyId === item.id}>
                    <Trash2 size={14} /> حذف دائمی
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="admin-automation-warning">
        <AlertTriangle size={16} />
        <span>«حذف دائمی» برگشت‌پذیر نیست و رسانه‌های متعلق به همان فایل را نیز از storage حذف می‌کند.</span>
      </div>
    </main>
  );
}
