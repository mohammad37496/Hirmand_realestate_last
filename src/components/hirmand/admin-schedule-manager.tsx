import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Clock3, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  listAdminPropertySchedules,
  updatePropertySchedule,
  type PropertyStatus,
} from "@/lib/properties";

type ScheduleRow = {
  id: string;
  title: string;
  status: PropertyStatus;
  scheduledPublishAt: string | null;
  scheduledUnpublishAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocal(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function statusLabel(status: PropertyStatus) {
  return status === "published" ? "منتشرشده" : status === "draft" ? "پیش‌نویس" : "بایگانی";
}

export function AdminScheduleManager() {
  const [items, setItems] = useState<ScheduleRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { publishAt: string; unpublishAt: string }>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const rows = await listAdminPropertySchedules({ data: { limit: 120 } });
      setItems(rows);
      setDrafts(
        Object.fromEntries(
          rows.map((row) => [
            row.id,
            {
              publishAt: toDateTimeLocal(row.scheduledPublishAt),
              unpublishAt: toDateTimeLocal(row.scheduledUnpublishAt),
            },
          ]),
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "زمان‌بندی فایل‌ها دریافت نشد.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return items;
    return items.filter((item) => item.title.toLocaleLowerCase().includes(normalized) || item.id.toLocaleLowerCase().includes(normalized));
  }, [items, query]);

  async function save(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setBusyId(id);
    try {
      await updatePropertySchedule({
        data: {
          id,
          publishAt: fromDateTimeLocal(draft.publishAt),
          unpublishAt: fromDateTimeLocal(draft.unpublishAt),
        },
      });
      toast.success("زمان‌بندی فایل ذخیره شد.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره زمان‌بندی انجام نشد.");
    } finally {
      setBusyId(null);
    }
  }

  function clearDraft(id: string) {
    setDrafts((current) => ({
      ...current,
      [id]: { publishAt: "", unpublishAt: "" },
    }));
  }

  return (
    <main className="admin-automation-page">
      <section className="admin-panel admin-automation-hero">
        <div className="admin-automation-hero-icon"><CalendarClock size={30} /></div>
        <div>
          <span className="kicker">اتوماسیون انتشار</span>
          <h2>زمان‌بندی انتشار و پایان نمایش فایل‌ها</h2>
          <p>می‌توانید برای هر فایل زمان شروع نمایش و زمان توقف نمایش عمومی تعیین کنید. زمان‌ها بر اساس ساعت دستگاه مدیر ثبت می‌شوند.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading || Boolean(busyId)}>
          <RefreshCw size={15} className={loading ? "admin-spin" : ""} /> بروزرسانی
        </button>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head admin-automation-toolbar">
          <div>
            <span className="kicker">تقویم فایل‌ها</span>
            <h2>{filtered.length.toLocaleString("fa-IR")} فایل در فهرست</h2>
          </div>
          <input
            className="admin-automation-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جستجوی عنوان یا کد فایل…"
            aria-label="جستجوی زمان‌بندی فایل‌ها"
          />
        </div>

        {loading && !items.length ? (
          <div className="admin-empty">در حال دریافت زمان‌بندی‌ها…</div>
        ) : !filtered.length ? (
          <div className="admin-empty">فایلی مطابق جستجو پیدا نشد.</div>
        ) : (
          <div className="admin-schedule-list">
            {filtered.map((item) => {
              const draft = drafts[item.id] ?? { publishAt: "", unpublishAt: "" };
              const activeNow =
                item.status === "published" &&
                (!item.scheduledUnpublishAt || new Date(item.scheduledUnpublishAt) > new Date());
              return (
                <article className="admin-schedule-row" key={item.id}>
                  <div className="admin-schedule-main">
                    <div className="admin-schedule-title">
                      <strong>{item.title}</strong>
                      <span className="admin-automation-status"><CheckCircle2 size={13} /> {statusLabel(item.status)}</span>
                      {activeNow ? <small>نمایش عمومی فعال</small> : null}
                    </div>
                    <small dir="ltr">{item.id.slice(-8).toUpperCase()}</small>
                  </div>

                  <div className="admin-schedule-fields">
                    <label>
                      <span><Clock3 size={13} /> شروع نمایش</span>
                      <input
                        type="datetime-local"
                        value={draft.publishAt}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: { ...draft, publishAt: event.target.value },
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span><Clock3 size={13} /> پایان نمایش</span>
                      <input
                        type="datetime-local"
                        value={draft.unpublishAt}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: { ...draft, unpublishAt: event.target.value },
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div className="admin-schedule-actions">
                    <button type="button" className="btn-ghost" onClick={() => clearDraft(item.id)} disabled={busyId === item.id}>
                      <RotateCcw size={14} /> پاک‌کردن زمان
                    </button>
                    <button type="button" className="btn-gold" onClick={() => void save(item.id)} disabled={busyId === item.id}>
                      {busyId === item.id ? <RefreshCw size={14} className="admin-spin" /> : <CalendarClock size={14} />}
                      {busyId === item.id ? "در حال ذخیره…" : "ذخیره"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="admin-automation-note">
        <strong>نحوه‌ی کار</strong>
        <span>فایل پیش‌نویس با «شروع نمایش» مشخص‌شده، پس از رسیدن زمان در سایت قابل مشاهده می‌شود و با «پایان نمایش» از فهرست عمومی خارج می‌شود؛ بدون نیاز به ویرایش دوباره‌ی فایل.</span>
      </section>
    </main>
  );
}
