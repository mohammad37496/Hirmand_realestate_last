import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, MessageCircle, Phone, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type Lead = { id: string; name: string; phone: string; deal: string; neighborhood: string; requestedBedrooms: number | null; consultant: string };
type Template = { id: string; title: string; body: string; channel: "whatsapp" | "sms" | "internal"; active: boolean; updatedAt: string | null };
const blank: Template = { id: "", title: "قالب جدید", body: "سلام {{نام}}، درباره درخواست {{معامله}} در {{محله}} با شما تماس گرفتم.", channel: "whatsapp", active: true, updatedAt: null };

const normalizePhone = (value: string) => {
  const p = value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
  return p.startsWith("0098") ? p.slice(2) : p.startsWith("98") ? p : p.replace(/^0/, "98");
};
function fill(body: string, lead: Lead) {
  return body.replaceAll("{{نام}}", lead.name || "مشتری").replaceAll("{{محله}}", lead.neighborhood || "درخواستی شما").replaceAll("{{معامله}}", lead.deal || "ملک").replaceAll("{{خواب}}", lead.requestedBedrooms == null ? "" : String(lead.requestedBedrooms)).replaceAll("{{مشاور}}", lead.consultant || "هیرمند");
}

export function AdminLeadMessageTemplates({ leads }: { leads: Lead[] }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [draft, setDraft] = useState<Template>(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-message-templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "list" }) });
      const data = (await response.json()) as { templates?: Template[]; statusMessage?: string };
      if (!response.ok) throw new Error(data.statusMessage || "قالب‌ها بارگذاری نشدند.");
      const items = Array.isArray(data.templates) ? data.templates : [];
      setTemplates(items);
      const keep = items.find((item) => item.id === selectedId) ?? items.find((item) => item.active) ?? items[0];
      if (keep) { setSelectedId(keep.id); setDraft(keep); }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "قالب‌های پیام بارگذاری نشدند.");
    } finally { setLoading(false); }
  }, [selectedId]);
  useEffect(() => { void load(); }, [load]);

  const lead = useMemo(() => leads.find((item) => item.id === leadId), [leads, leadId]);
  const message = lead ? fill(draft.body, lead) : draft.body;
  const whatsapp = lead && draft.channel === "whatsapp" ? "https://wa.me/" + normalizePhone(lead.phone) + "?text=" + encodeURIComponent(message) : "";

  function selectTemplate(id: string) {
    const item = templates.find((template) => template.id === id);
    setSelectedId(id);
    if (item) setDraft(item);
  }
  function startNew() {
    setSelectedId("");
    setDraft({ ...blank, id: "custom-" + Date.now() });
  }
  async function save() {
    if (!draft.title.trim() || !draft.body.trim()) { toast.error("عنوان و متن پیام را کامل کنید."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/admin-message-templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", ...draft, id: draft.id || "custom-" + Date.now() }) });
      const data = (await response.json().catch(() => null)) as { statusMessage?: string } | null;
      if (!response.ok) throw new Error(data?.statusMessage || "ذخیره قالب انجام نشد.");
      toast.success("قالب پیام ذخیره شد.");
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "ذخیره قالب انجام نشد."); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!draft.id || ["first","visit","match","reminder","follow"].includes(draft.id)) return;
    if (!window.confirm("این قالب حذف شود؟")) return;
    try {
      const response = await fetch("/api/admin-message-templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", id: draft.id }) });
      const data = (await response.json().catch(() => null)) as { statusMessage?: string } | null;
      if (!response.ok) throw new Error(data?.statusMessage || "حذف قالب انجام نشد.");
      toast.success("قالب حذف شد.");
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "حذف قالب انجام نشد."); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(message); toast.success("متن پیام کپی شد."); }
    catch { toast.error("کپی مستقیم در این مرورگر در دسترس نیست."); }
  }

  return (
    <section className="admin-panel admin-message-templates" dir="rtl">
      <div className="admin-panel-head">
        <div><span className="kicker">CRM پیشرفته</span><h2><MessageCircle size={18} /> قالب‌های پیام قابل‌ویرایش</h2><p>متن‌های ثابت را خودتان مدیریت کنید و برای هر مشتری با اطلاعات خودش آماده ارسال بسازید.</p></div>
        <button type="button" className="btn-ghost" onClick={startNew}><Plus size={15} /> قالب جدید</button>
      </div>
      <div className="admin-message-manager-grid">
        <div className="admin-message-template-list">
          {loading ? <div className="admin-empty">در حال دریافت قالب‌ها…</div> : templates.map((item) => (
            <button key={item.id} type="button" className={"admin-message-template-item" + (item.id === selectedId ? " is-active" : "")} onClick={() => selectTemplate(item.id)}>
              <span>{item.title}</span><small>{item.active ? "فعال" : "غیرفعال"} · {item.channel === "whatsapp" ? "واتساپ" : item.channel === "sms" ? "پیامک" : "داخلی"}</small>
            </button>
          ))}
        </div>
        <div className="admin-message-editor">
          <div className="admin-message-editor-row">
            <label className="field"><span>عنوان</span><input value={draft.title} onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))} /></label>
            <label className="field"><span>کانال</span><select value={draft.channel} onChange={(e) => setDraft((v) => ({ ...v, channel: e.target.value as Template["channel"] }))}><option value="whatsapp">واتساپ</option><option value="sms">پیامک</option><option value="internal">یادداشت داخلی</option></select></label>
            <label className="field"><span>وضعیت</span><button type="button" className={"admin-consultant-status-toggle" + (draft.active ? " is-active" : "")} onClick={() => setDraft((v) => ({ ...v, active: !v.active }))}><span />{draft.active ? "فعال" : "غیرفعال"}</button></label>
          </div>
          <label className="field"><span>متن پیام</span><textarea rows={6} value={draft.body} onChange={(e) => setDraft((v) => ({ ...v, body: e.target.value }))} /></label>
          <small className="admin-message-help">متغیرها: <code>{"{{نام}}"}</code> <code>{"{{محله}}"}</code> <code>{"{{معامله}}"}</code> <code>{"{{خواب}}"}</code> <code>{"{{مشاور}}"}</code></small>
          <div className="admin-message-editor-actions">
            <button type="button" className="btn-gold" onClick={() => void save()} disabled={saving}><Save size={15} />{saving ? "در حال ذخیره…" : "ذخیره قالب"}</button>
            {draft.id && !["first","visit","match","reminder","follow"].includes(draft.id) ? <button type="button" className="btn-ghost" onClick={() => void remove()}><Trash2 size={15} /> حذف</button> : null}
            <button type="button" className="btn-ghost" onClick={() => setDraft(templates.find((x) => x.id === selectedId) ?? blank)}><X size={15} /> بازنشانی</button>
          </div>
        </div>
      </div>
      <div className="admin-message-send-box">
        <div className="admin-message-grid"><label className="field"><span>مشتری برای پیش‌نمایش</span><select value={leadId} onChange={(e) => setLeadId(e.target.value)}><option value="">انتخاب مشتری</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name} · {lead.phone}</option>)}</select></label></div>
        <textarea className="admin-message-preview" value={message} readOnly aria-label="پیش‌نمایش پیام" />
        <div className="admin-message-actions">
          <button className="btn-gold" type="button" onClick={() => void copy()}><Copy size={15} /> کپی متن</button>
          {whatsapp ? <a className="btn-ghost" href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={15} /> باز کردن واتساپ</a> : null}
          {lead ? <a className="btn-ghost" href={"tel:" + lead.phone}><Phone size={15} /> تماس</a> : null}
        </div>
      </div>
    </section>
  );
}
