import { useEffect, useState } from "react";
import { CircleCheck, Flag, MessageSquareText, RotateCcw, Save } from "lucide-react";
import type { Property } from "@/lib/properties";
import "@/property-scenario-tools.css";

const KEY = "hirmand-property-visit-outcome-v1:";
const STATUSES = [
  { value: "interested", label: "مناسب بود؛ پیگیری می‌کنم" },
  { value: "review", label: "نیاز به بررسی بیشتر" },
  { value: "negotiate", label: "مناسب است؛ مذاکره لازم دارد" },
  { value: "reject", label: "رد شد" },
] as const;
const FLAGS = ["قیمت", "سند/مدارک", "وضعیت فنی", "مشاعات", "پارکینگ", "نور و صدا", "محله", "شرایط پرداخت"] as const;

export function PropertyVisitOutcome({ property }: { property: Property }) {
  const [status, setStatus] = useState<(typeof STATUSES)[number]["value"]>("interested");
  const [flags, setFlags] = useState<string[]>([]);
  const [nextAction, setNextAction] = useState("تماس با مشاور");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY + property.id);
      const data = raw ? JSON.parse(raw) : null;
      if (!data) return;
      if (STATUSES.some((item) => item.value === data.status)) setStatus(data.status);
      if (Array.isArray(data.flags)) setFlags(data.flags.filter((item: unknown): item is string => typeof item === "string"));
      if (typeof data.nextAction === "string") setNextAction(data.nextAction);
      if (typeof data.note === "string") setNote(data.note.slice(0, 800));
    } catch {
      // Keep default visit outcome when storage is unavailable.
    }
  }, [property.id]);

  function toggleFlag(flag: string) {
    setFlags((current) => current.includes(flag) ? current.filter((item) => item !== flag) : [...current, flag]);
    setSaved(false);
  }

  function save() {
    try {
      localStorage.setItem(KEY + property.id, JSON.stringify({ status, flags, nextAction, note }));
    } catch {
      // Keep the result in memory even when storage is blocked.
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  function reset() {
    setStatus("interested");
    setFlags([]);
    setNextAction("تماس با مشاور");
    setNote("");
    try { localStorage.removeItem(KEY + property.id); } catch { /* memory reset still works */ }
    setSaved(false);
  }

  return (
    <section className="property-outcome-tool" aria-labelledby="property-visit-outcome-title">
      <header className="property-outcome-head">
        <div>
          <span className="kicker">بعد از بازدید</span>
          <h2 id="property-visit-outcome-title"><CircleCheck size={20} /> نتیجه بازدید و قدم بعدی</h2>
          <p>نتیجه بازدید و پرچم‌های شما فقط در مرورگر ذخیره می‌شوند و برای اولویت‌بندی شخصی فایل است.</p>
        </div>
      </header>
      <div className="property-outcome-fields">
        <label><span>نتیجه</span><select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setSaved(false); }}>{STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label><span>قدم بعدی</span><select value={nextAction} onChange={(e) => { setNextAction(e.target.value); setSaved(false); }}><option>تماس با مشاور</option><option>درخواست مدارک</option><option>مذاکره قیمت</option><option>بازدید دوم</option><option>فعلاً هیچ اقدامی</option></select></label>
      </div>
      <div className="property-outcome-flags">
        <span>مواردی که هنوز باید بررسی شوند</span>
        <div>{FLAGS.map((flag) => <button key={flag} type="button" className={flags.includes(flag) ? "is-active" : ""} onClick={() => toggleFlag(flag)}><Flag size={13} />{flag}</button>)}</div>
      </div>
      <label className="property-outcome-note"><span><MessageSquareText size={14} /> یادداشت نتیجه</span><textarea rows={4} maxLength={800} value={note} onChange={(e) => { setNote(e.target.value); setSaved(false); }} placeholder="چه چیزی در بازدید تأیید یا رد شد؟ برای تصمیم بعدی چه چیزی مهم است؟" /></label>
      <div className="property-outcome-actions">
        <button type="button" className="property-outcome-save" onClick={save}><Save size={15} /> {saved ? "ذخیره شد" : "ذخیره نتیجه"}</button>
        <button type="button" className="property-outcome-reset" onClick={reset}><RotateCcw size={14} /> بازنشانی</button>
      </div>
    </section>
  );
}
