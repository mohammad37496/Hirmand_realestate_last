import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Briefcase, Handshake, Pencil, Plus, Save, Trash2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import {
  deleteConsultant,
  listAdminConsultants,
  saveConsultant,
  type Consultant,
  type ConsultantIcon,
} from "@/lib/consultants";

type FormState = Omit<Consultant, "sortOrder" | "isActive"> & {
  sortOrder: string;
  isActive: boolean;
};

function emptyForm(sortOrder = 30): FormState {
  return {
    id: "",
    name: "",
    role: "مشاور املاک",
    phone: "",
    phoneDisplay: "",
    icon: "handshake",
    bio: "",
    whatsapp: "",
    telegram: "",
    eitaa: "",
    instagram: "",
    rubika: "",
    bale: "",
    igap: "",
    soroush: "",
    sortOrder: String(sortOrder),
    isActive: true,
  };
}

function toForm(person: Consultant): FormState {
  return {
    ...person,
    sortOrder: String(person.sortOrder),
  };
}

export function AdminConsultantManager() {
  const [items, setItems] = useState<Consultant[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setItems(await listAdminConsultants());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "دریافت مشاورین انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const activeCount = useMemo(() => items.filter((item) => item.isActive).length, [items]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startNew() {
    setEditing(null);
    setForm(emptyForm(items.length ? Math.max(...items.map((item) => item.sortOrder)) + 10 : 10));
  }

  function edit(item: Consultant) {
    setEditing(item.id);
    setForm(toForm(item));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const id = form.id.trim();
    if (!id || !form.name.trim() || !form.phone.trim()) {
      toast.error("شناسه، نام و شماره تماس را کامل کنید.");
      return;
    }

    setSaving(true);
    try {
      await saveConsultant({
        data: {
          ...form,
          id: id.toLowerCase().replace(/\s+/g, "-"),
          name: form.name.trim(),
          role: form.role.trim(),
          phone: form.phone.trim(),
          phoneDisplay: form.phoneDisplay.trim() || form.phone.trim(),
          bio: form.bio.trim(),
          sortOrder: Number(form.sortOrder) || 0,
          isActive: form.isActive,
        },
      });
      toast.success(editing ? "مشاور ویرایش شد." : "مشاور اضافه شد.");
      await refresh();
      startNew();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره مشاور انجام نشد.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: Consultant) {
    if (item.id === "sheikh" || item.id === "moradi") {
      toast.error("دو پروفایل اصلی هیرمند حذف نمی‌شوند؛ می‌توانید غیرفعالشان کنید.");
      return;
    }
    if (!window.confirm(`مشاور «${item.name}» حذف شود؟`)) return;
    try {
      await deleteConsultant({ data: { id: item.id } });
      toast.success("مشاور حذف شد.");
      await refresh();
      if (editing === item.id) startNew();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "حذف مشاور انجام نشد.");
    }
  }

  return (
    <section className="admin-consultants-manager">
      <div className="admin-panel admin-consultants-summary">
        <div>
          <span className="kicker">مدیریت تیم</span>
          <h2>مشاورین و اعضای بنگاه</h2>
          <p>اعضا را اضافه، ویرایش، غیرفعال یا مرتب کنید. هر عضو می‌تواند صفحه پروفایل مستقل داشته باشد.</p>
        </div>
        <div className="admin-consultants-count">
          <strong>{activeCount.toLocaleString("fa-IR")}</strong>
          <span>عضو فعال</span>
        </div>
        <button type="button" className="btn-gold" onClick={startNew}>
          <Plus size={16} /> افزودن عضو
        </button>
      </div>

      <div className="admin-consultants-layout">
        <form className="admin-panel admin-consultant-form" onSubmit={submit}>
          <div className="admin-panel-head">
            <div>
              <span className="kicker">{editing ? "ویرایش عضو" : "عضو جدید"}</span>
              <h2>{editing ? "ویرایش اطلاعات مشاور" : "افزودن مشاور جدید"}</h2>
            </div>
            {editing ? (
              <button type="button" className="admin-icon-btn" onClick={startNew} title="انصراف">
                <X size={16} />
              </button>
            ) : null}
          </div>

          <div className="admin-form-grid">
            <label className="field">
              <span>شناسه انگلیسی</span>
              <input value={form.id} disabled={Boolean(editing)} onChange={(e) => update("id", e.target.value)} placeholder="مثلاً ahmad-karimi" dir="ltr" />
            </label>
            <label className="field">
              <span>نام</span>
              <input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="نام و نام خانوادگی" required />
            </label>
            <label className="field">
              <span>سمت</span>
              <input value={form.role} onChange={(e) => update("role", e.target.value)} placeholder="مشاور ارشد" required />
            </label>
            <label className="field">
              <span>شماره تماس</span>
              <input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="0912..." dir="ltr" required />
            </label>
            <label className="field">
              <span>شماره نمایشی</span>
              <input value={form.phoneDisplay} onChange={(e) => update("phoneDisplay", e.target.value)} placeholder="0912 123 4567" dir="ltr" />
            </label>
            <label className="field">
              <span>آیکن پروفایل</span>
              <select value={form.icon} onChange={(e) => update("icon", e.target.value as ConsultantIcon)}>
                <option value="handshake">مشاوره / همکاری</option>
                <option value="briefcase">مدیریت / اداری</option>
              </select>
            </label>
            <label className="field">
              <span>ترتیب نمایش</span>
              <input value={form.sortOrder} onChange={(e) => update("sortOrder", e.target.value.replace(/\D/g, ""))} inputMode="numeric" dir="ltr" />
            </label>
            <label className="field admin-consultant-active-toggle">
              <span>وضعیت</span>
              <button type="button" className={`admin-consultant-status-toggle${form.isActive ? " is-active" : ""}`} onClick={() => update("isActive", !form.isActive)}>
                <span />
                {form.isActive ? "فعال و قابل نمایش" : "غیرفعال"}
              </button>
            </label>
            <label className="field admin-span-2">
              <span>معرفی کوتاه</span>
              <textarea rows={3} value={form.bio} onChange={(e) => update("bio", e.target.value)} placeholder="متن کوتاه برای کارت و پروفایل مشاور…" />
            </label>
          </div>

          <fieldset className="admin-consultant-socials">
            <legend>راه‌های ارتباطی</legend>
            <div className="admin-form-grid">
              <label className="field"><span>واتساپ</span><input value={form.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} placeholder="https://wa.me/..." dir="ltr" /></label>
              <label className="field"><span>تلگرام</span><input value={form.telegram} onChange={(e) => update("telegram", e.target.value)} placeholder="https://t.me/..." dir="ltr" /></label>
              <label className="field"><span>ایتا</span><input value={form.eitaa} onChange={(e) => update("eitaa", e.target.value)} placeholder="https://eitaa.com/..." dir="ltr" /></label>
              <label className="field"><span>اینستاگرام</span><input value={form.instagram} onChange={(e) => update("instagram", e.target.value)} placeholder="https://ig.me/..." dir="ltr" /></label>
              <label className="field"><span>روبیکا</span><input value={form.rubika} onChange={(e) => update("rubika", e.target.value)} placeholder="https://rubika.ir/..." dir="ltr" /></label>
              <label className="field"><span>بله</span><input value={form.bale} onChange={(e) => update("bale", e.target.value)} placeholder="https://ble.ir/..." dir="ltr" /></label>
              <label className="field"><span>ایگپ</span><input value={form.igap} onChange={(e) => update("igap", e.target.value)} placeholder="https://igap.net/..." dir="ltr" /></label>
              <label className="field"><span>سروش</span><input value={form.soroush} onChange={(e) => update("soroush", e.target.value)} placeholder="https://splus.ir/..." dir="ltr" /></label>
            </div>
          </fieldset>

          <div className="admin-form-actions">
            <button type="submit" className="btn-gold" disabled={saving}>
              <Save size={16} /> {saving ? "در حال ذخیره…" : editing ? "ذخیره تغییرات" : "افزودن به تیم"}
            </button>
            <button type="button" className="btn-ghost" onClick={startNew}>
              <Plus size={16} /> فرم جدید
            </button>
          </div>
        </form>

        <section className="admin-panel admin-consultant-list">
          <div className="admin-panel-head">
            <div>
              <span className="kicker">فهرست</span>
              <h2>اعضای ثبت‌شده</h2>
            </div>
            <span className="admin-consultant-list-count">{items.length.toLocaleString("fa-IR")} نفر</span>
          </div>
          {loading ? (
            <div className="admin-empty-state"><UserRound size={24} /><strong>در حال دریافت…</strong></div>
          ) : (
            <div className="admin-consultant-records">
              {items.map((item) => {
                const Icon = item.icon === "briefcase" ? Briefcase : Handshake;
                return (
                  <article key={item.id} className={`admin-consultant-record${item.isActive ? "" : " is-inactive"}`}>
                    <div className="admin-consultant-record-icon"><Icon size={19} /></div>
                    <div className="admin-consultant-record-main">
                      <strong>{item.name}</strong>
                      <span>{item.role}</span>
                      <small dir="ltr">{item.phoneDisplay}</small>
                    </div>
                    <div className="admin-consultant-record-actions">
                      <button type="button" className="admin-icon-btn" onClick={() => edit(item)} title="ویرایش"><Pencil size={15} /></button>
                      <button type="button" className="admin-icon-btn danger" onClick={() => void remove(item)} title="حذف"><Trash2 size={15} /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
