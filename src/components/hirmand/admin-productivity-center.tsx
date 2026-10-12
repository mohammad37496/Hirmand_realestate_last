import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, CalendarDays, CheckCircle2, Clock3, Database, ExternalLink,
  ListTodo, Plus, RefreshCw, SearchX, ServerCog, ShieldCheck, Trash2,
} from "lucide-react";
import { toast } from "sonner";

type TaskStatus = "open" | "done" | "cancelled";
type Priority = "low" | "normal" | "high" | "urgent";
type Task = {
  id: string; title: string; description: string; status: TaskStatus; priority: Priority;
  dueAt: string | null; assignee: string; entityType: string; entityId: string | null;
  createdAt: string; updatedAt: string;
};
type ProductivityData = {
  tasks: { open: number; overdue: number; today: number; next7: number };
  propertyHealth: { total: number; published: number; withoutImages: number; incomplete: number; stale: number; expiredFeatured: number };
  staleProperties: Array<{ id: string; slug: string; title: string; neighborhood: string; updatedAt: string }>;
  expiredFeatured: Array<{ id: string; slug: string; title: string; featuredUntil: string }>;
  duplicateGroups: Array<{ kind: "owner" | "title"; key: string; label: string; neighborhood: string; fileCount: number; files: Array<{ id: string; slug: string; title: string }> }>;
  recentActivity: Array<{ source: string; itemId: string; event: string; title: string; createdAt: string }>;
  system: { database: string; counts: Record<string, number>; generatedAt: string };
};

const PRIORITY_LABEL: Record<Priority, string> = { low: "کم", normal: "عادی", high: "بالا", urgent: "فوری" };
const TASK_STATUS_LABEL: Record<TaskStatus, string> = { open: "باز", done: "انجام‌شده", cancelled: "لغوشده" };

function faNumber(value: number) { return value.toLocaleString("fa-IR"); }
function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" }) : "بدون زمان";
}
function dayKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function labelForDay(key: string) {
  return new Intl.DateTimeFormat("fa-IR", { weekday: "short", month: "short", day: "numeric" }).format(new Date(key + "T12:00:00"));
}

const CENTER_CSS = [
".admin-productivity{display:grid;gap:18px}",
".admin-productivity-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}",
".admin-productivity-stat{display:grid;gap:5px;padding:15px 16px;background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--el-1)}",
".admin-productivity-stat[data-tone='danger']{background:var(--danger-bg);border-color:rgb(163 49 39 / 25%)}",
".admin-productivity-stat[data-tone='gold']{background:var(--brass-100);border-color:var(--brass-300)}",
".admin-productivity-stat small{color:var(--subtle);font-size:.7rem}.admin-productivity-stat strong{color:var(--navy-900);font-size:1.25rem;font-variant-numeric:tabular-nums}",
".admin-productivity-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.admin-productivity-toolbar .admin-search{flex:1;min-width:220px}",
".admin-productivity-panels{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(300px,.75fr);gap:18px;align-items:start}",
".admin-productivity-list{display:grid;gap:10px}.admin-productivity-task{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:11px;align-items:start;padding:13px 14px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--card)}",
".admin-productivity-task.is-overdue{border-color:rgb(163 49 39 / 30%);background:var(--danger-bg)}.admin-productivity-task-main{min-width:0;display:grid;gap:4px}",
".admin-productivity-task-main strong{color:var(--navy-900);font-size:.82rem}.admin-productivity-task-main p{margin:0;color:var(--muted);font-size:.72rem;line-height:1.7}",
".admin-productivity-task-meta{display:flex;flex-wrap:wrap;gap:6px;color:var(--subtle);font-size:.66rem}.admin-productivity-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border:1px solid var(--line);border-radius:999px;background:var(--card-2)}",
".admin-productivity-chip[data-priority='urgent'],.admin-productivity-chip[data-priority='high']{border-color:rgb(163 49 39 / 28%);color:var(--danger)}.admin-productivity-chip[data-priority='normal']{color:var(--brass-700)}",
".admin-productivity-actions{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.admin-productivity-form{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(180px,.7fr) minmax(160px,.6fr) minmax(160px,.6fr) auto;gap:8px;align-items:end}",
".admin-productivity-calendar{display:grid;gap:8px}.admin-productivity-day{display:grid;gap:6px;padding:10px 11px;background:var(--card-2);border:1px solid var(--line);border-radius:var(--r-md)}",
".admin-productivity-day-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.admin-productivity-day-head strong{color:var(--navy-900);font-size:.75rem}.admin-productivity-day-head span{color:var(--subtle);font-size:.68rem}",
".admin-productivity-day-items{display:grid;gap:5px}.admin-productivity-day-item{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:7px 8px;border-radius:8px;background:var(--card);border:1px solid var(--line)}.admin-productivity-day-item span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:.69rem}",
".admin-productivity-health{display:grid;gap:9px}.admin-productivity-health-row{display:grid;grid-template-columns:minmax(120px,1fr) auto auto;gap:9px;align-items:center;padding:10px 11px;border:1px solid var(--line);border-radius:10px;background:var(--card-2)}",
".admin-productivity-health-row strong{color:var(--navy-900);font-size:.73rem}.admin-productivity-health-row span{color:var(--muted);font-size:.72rem}.admin-productivity-health-row[data-tone='danger']{background:var(--danger-bg);border-color:rgb(163 49 39 / 22%)}",
".admin-productivity-duplicates{display:grid;gap:9px}.admin-productivity-duplicate{display:grid;gap:6px;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card)}",
".admin-productivity-duplicate strong{color:var(--navy-900);font-size:.75rem}.admin-productivity-duplicate small{color:var(--subtle);font-size:.67rem;line-height:1.6}",
".admin-productivity-file-links{display:flex;flex-wrap:wrap;gap:5px}.admin-productivity-file-links a{display:inline-flex;gap:4px;align-items:center;padding:5px 7px;border:1px solid var(--line);border-radius:8px;background:var(--card-2);color:var(--navy-900);font-size:.66rem;text-decoration:none}",
".admin-productivity-activity{display:grid;gap:8px}.admin-productivity-activity-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px 10px;border-bottom:1px solid var(--line)}",
".admin-productivity-activity-item:last-child{border-bottom:0}.admin-productivity-activity-dot{width:8px;height:8px;border-radius:50%;background:var(--brass-500);box-shadow:0 0 0 4px var(--brass-100)}",
".admin-productivity-activity-item strong{display:block;color:var(--navy-900);font-size:.7rem}.admin-productivity-activity-item small{display:block;margin-top:2px;color:var(--subtle);font-size:.63rem}.admin-productivity-activity-item time{color:var(--subtle);font-size:.61rem;white-space:nowrap}",
".admin-productivity-empty{padding:20px;text-align:center;color:var(--subtle);border:1px dashed var(--line-2);border-radius:var(--r-md)}",
".admin-productivity-notice{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border:1px solid var(--brass-300);background:var(--brass-100);border-radius:var(--r-md);color:var(--navy-900)}",
".admin-productivity-notice strong{display:block;font-size:.78rem}.admin-productivity-notice span{display:block;margin-top:3px;color:var(--muted);font-size:.68rem;line-height:1.8}",
"@media (max-width:1000px){.admin-productivity-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.admin-productivity-panels{grid-template-columns:1fr}}",
"@media (max-width:700px){.admin-productivity-grid{grid-template-columns:1fr 1fr}.admin-productivity-form{grid-template-columns:1fr}.admin-productivity-task{grid-template-columns:auto minmax(0,1fr)}.admin-productivity-actions{grid-column:1/-1;justify-content:flex-start}.admin-productivity-health-row{grid-template-columns:minmax(0,1fr) auto}.admin-productivity-health-row a{grid-column:1/-1;justify-self:start}}",
"@media (max-width:460px){.admin-productivity-grid{grid-template-columns:1fr}}",
].join("\n");

export function AdminProductivityCenter() {
  const [data, setData] = useState<ProductivityData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [dueAt, setDueAt] = useState("");
  const [description, setDescription] = useState("");

  async function request<T>(action: string, body: Record<string, unknown> = {}) {
    const response = await fetch("/api/admin-productivity", {
      method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify(Object.assign({ action }, body)),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.statusMessage || "عملیات انجام نشد.");
    return result as T;
  }

  async function loadAll() {
    setLoading(true);
    try {
      const results = await Promise.all([request<ProductivityData>("summary"), request<{ tasks: Task[] }>("list_tasks")]);
      setData(results[0]);
      setTasks(results[1].tasks || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "مرکز مدیریت بارگذاری نشد.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    void loadAll();
    const timer = window.setInterval(() => void loadAll(), 60000);
    return () => window.clearInterval(timer);
    // loadAll is intentionally kept local to this screen; refresh cadence is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTasks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return tasks;
    return tasks.filter((task) => [task.title, task.description, task.assignee].some((value) => value.toLocaleLowerCase().includes(normalized)));
  }, [tasks, query]);

  const calendarDays = useMemo(() => {
    const buckets = new Map<string, Task[]>();
    tasks.forEach((task) => {
      if (!task.dueAt) return;
      const key = dayKey(task.dueAt);
      const list = buckets.get(key) || [];
      list.push(task);
      buckets.set(key, list);
    });
    return Array.from(buckets.entries()).sort((a,b) => a[0].localeCompare(b[0])).slice(0, 14);
  }, [tasks]);

  async function createTask() {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await request("create_task", { title, description, assignee, priority, dueAt: dueAt || null });
      setTitle(""); setDescription(""); setDueAt("");
      toast.success("وظیفه ثبت شد.");
      await loadAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ثبت وظیفه انجام نشد.");
    } finally { setSaving(false); }
  }

  async function updateTask(id: string, patch: Record<string, unknown>) {
    try { await request("update_task", Object.assign({ id }, patch)); await loadAll(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "به‌روزرسانی وظیفه انجام نشد."); }
  }

  async function deleteTask(id: string) {
    if (!window.confirm("این وظیفه حذف شود؟")) return;
    try { await request("delete_task", { id }); await loadAll(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "حذف وظیفه انجام نشد."); }
  }

  const now = Date.now();
  const isOverdue = (task: Task) => task.status === "open" && !!task.dueAt && new Date(task.dueAt).getTime() < now;

  return (
    <div className="admin-productivity">
      <style dangerouslySetInnerHTML={{ __html: CENTER_CSS }} />
      {(data?.tasks.overdue || data?.propertyHealth.incomplete) ? (
        <div className="admin-productivity-notice">
          <AlertCircle size={18} />
          <div><strong>چند مورد نیازمند اقدام فوری است.</strong><span>{faNumber(data?.tasks.overdue || 0)} وظیفه عقب‌افتاده و {faNumber(data?.propertyHealth.incomplete || 0)} فایل ناقص دارید.</span></div>
        </div>
      ) : null}

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div><span className="kicker">مرکز مدیریت</span><h2>کارهای امروز، هشدارها و سلامت سیستم</h2></div>
          <div className="admin-productivity-toolbar">
            <label className="admin-search"><SearchX size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجوی وظیفه…" /></label>
            <button className="btn-ghost" type="button" onClick={() => void loadAll()} disabled={loading}><RefreshCw size={15} className={loading ? "admin-spin" : undefined}/>به‌روزرسانی</button>
          </div>
        </div>
        <div className="admin-productivity-grid">
          <div className="admin-productivity-stat" data-tone={data?.tasks.overdue ? "danger" : undefined}><small>پیگیری‌های عقب‌افتاده</small><strong>{faNumber(data?.tasks.overdue || 0)}</strong></div>
          <div className="admin-productivity-stat" data-tone="gold"><small>وظایف باز</small><strong>{faNumber(data?.tasks.open || 0)}</strong></div>
          <div className="admin-productivity-stat"><small>وظایف ۷ روز آینده</small><strong>{faNumber(data?.tasks.next7 || 0)}</strong></div>
          <div className="admin-productivity-stat" data-tone={data?.propertyHealth.incomplete ? "danger" : undefined}><small>فایل ناقص</small><strong>{faNumber(data?.propertyHealth.incomplete || 0)}</strong></div>
        </div>

        <div className="admin-productivity-form" style={{ marginTop: 14 }}>
          <label className="field"><span>وظیفه جدید</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً تصاویر یک فایل را بررسی کن" /></label>
          <label className="field"><span>مسئول</span><input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="نام مشاور/اپراتور" /></label>
          <label className="field"><span>اولویت</span><select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>{Object.entries(PRIORITY_LABEL).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>موعد</span><input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></label>
          <button className="btn-gold" type="button" onClick={() => void createTask()} disabled={saving || !title.trim()}><Plus size={15}/>{saving ? "در حال ثبت…" : "ثبت وظیفه"}</button>
          <label className="field" style={{ gridColumn: "1 / -1" }}><span>توضیح</span><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        </div>
      </section>

      <div className="admin-productivity-panels">
        <section className="admin-panel">
          <div className="admin-panel-head"><div><span className="kicker">وظایف</span><h2>{faNumber(filteredTasks.length)} مورد</h2></div><ListTodo size={18} color="var(--brass-700)" /></div>
          {filteredTasks.length ? <div className="admin-productivity-list">
            {filteredTasks.map((task) => (
              <article key={task.id} className={"admin-productivity-task" + (isOverdue(task) ? " is-overdue" : "")}>
                <button className="admin-icon-btn" type="button" title="تغییر وضعیت" onClick={() => void updateTask(task.id, { status: task.status === "done" ? "open" : "done" })}><CheckCircle2 size={17}/></button>
                <div className="admin-productivity-task-main">
                  <strong>{task.title}</strong>
                  {task.description ? <p>{task.description}</p> : null}
                  <div className="admin-productivity-task-meta">
                    <span className="admin-productivity-chip" data-priority={task.priority}>{PRIORITY_LABEL[task.priority]}</span>
                    <span className="admin-productivity-chip"><Clock3 size={11}/>{formatDate(task.dueAt)}</span>
                    {task.assignee ? <span className="admin-productivity-chip">{task.assignee}</span> : null}
                    <span className="admin-productivity-chip">{TASK_STATUS_LABEL[task.status]}</span>
                  </div>
                </div>
                <div className="admin-productivity-actions">
                  {task.dueAt ? <span className="admin-productivity-chip">{dayKey(task.dueAt) === todayKey() ? "امروز" : "تقویم"}</span> : null}
                  <button className="admin-icon-btn danger" type="button" title="حذف وظیفه" onClick={() => void deleteTask(task.id)}><Trash2 size={15}/></button>
                </div>
              </article>
            ))}
          </div> : <div className="admin-productivity-empty">برای این فیلتر وظیفه‌ای وجود ندارد.</div>}
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head"><div><span className="kicker">تقویم کاری</span><h2>موعدهای ثبت‌شده</h2></div><CalendarDays size={18} color="var(--brass-700)" /></div>
          {calendarDays.length ? <div className="admin-productivity-calendar">
            {calendarDays.map(([key, items]) => (
              <div key={key} className="admin-productivity-day">
                <div className="admin-productivity-day-head"><strong>{labelForDay(key)}</strong><span>{faNumber(items.length)} کار</span></div>
                <div className="admin-productivity-day-items">
                  {items.map((task) => <div key={task.id} className="admin-productivity-day-item"><span>{task.title}</span><small>{new Date(task.dueAt as string).toLocaleTimeString("fa-IR",{hour:"2-digit",minute:"2-digit"})}</small></div>)}
                </div>
              </div>
            ))}
          </div> : <div className="admin-productivity-empty">هنوز موعدی در تقویم ثبت نشده است.</div>}
        </section>
      </div>

      <div className="admin-productivity-panels">
        <section className="admin-panel">
          <div className="admin-panel-head"><div><span className="kicker">سلامت فایل‌ها</span><h2>موارد نیازمند بررسی</h2></div><ShieldCheck size={18} color="var(--brass-700)" /></div>
          <div className="admin-productivity-health">
            {[
              ["بدون تصویر", data?.propertyHealth.withoutImages || 0],
              ["ناقص", data?.propertyHealth.incomplete || 0],
              ["قدیمی‌تر از ۳۰ روز", data?.propertyHealth.stale || 0],
              ["ویژه منقضی‌شده", data?.propertyHealth.expiredFeatured || 0],
              ["گروه‌های تکراری احتمالی", data?.duplicateGroups.length || 0],
            ].map(([label,value], index) => (
              <div key={index} className="admin-productivity-health-row" data-tone={Number(value) ? "danger" : undefined}>
                <strong>{String(label)}</strong><span>{faNumber(Number(value))}</span><span>{Number(value) ? "نیاز به بررسی" : "OK"}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head"><div><span className="kicker">تکراری‌ها</span><h2>کاندیدهای بررسی</h2></div><SearchX size={18} color="var(--brass-700)" /></div>
          {data?.duplicateGroups.length ? <div className="admin-productivity-duplicates">
            {data.duplicateGroups.map((group) => (
              <div key={group.kind + group.key} className="admin-productivity-duplicate">
                <strong>{group.label}</strong><small>{group.neighborhood || "بدون محله"} · {faNumber(group.fileCount)} فایل</small>
                <div className="admin-productivity-file-links">{group.files.map((file) => (
                  <a key={file.id} href={"/properties/" + encodeURIComponent(file.slug)} target="_blank" rel="noreferrer">{file.title || file.id.slice(0, 6)} <ExternalLink size={11}/></a>
                ))}</div>
              </div>
            ))}
          </div> : <div className="admin-productivity-empty">مورد تکراری احتمالی پیدا نشد.</div>}
        </section>
      </div>

      <div className="admin-productivity-panels">
        <section className="admin-panel">
          <div className="admin-panel-head"><div><span className="kicker">سیستم</span><h2>وضعیت سرویس‌ها</h2></div><ServerCog size={18} color="var(--brass-700)" /></div>
          <div className="admin-productivity-health">
            <div className="admin-productivity-health-row"><strong><Database size={14}/> پایگاه داده</strong><span>{data?.system.database === "connected" ? "متصل" : "نامشخص"}</span><span><CheckCircle2 size={15}/></span></div>
            {Object.entries(data?.system.counts || {}).map(([key,value]) => (
              <div key={key} className="admin-productivity-health-row"><strong>{key === "properties" ? "فایل‌ها" : key === "leads" ? "درخواست‌ها" : key === "consultants" ? "مشاوران" : key === "media" ? "رسانه" : "وظایف"}</strong><span>{faNumber(value)}</span><span><CheckCircle2 size={15}/></span></div>
            ))}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head"><div><span className="kicker">Audit feed</span><h2>آخرین فعالیت‌ها</h2></div><Clock3 size={18} color="var(--brass-700)" /></div>
          {data?.recentActivity.length ? <div className="admin-productivity-activity">
            {data.recentActivity.map((item, index) => (
              <div key={item.source + item.itemId + index} className="admin-productivity-activity-item"><span className="admin-productivity-activity-dot" /><div><strong>{item.title || item.event}</strong><small>{item.source} · {item.event}</small></div><time>{formatDate(item.createdAt)}</time></div>
            ))}
          </div> : <div className="admin-productivity-empty">فعالیتی برای نمایش نیست.</div>}
        </section>
      </div>
    </div>
  );
}
