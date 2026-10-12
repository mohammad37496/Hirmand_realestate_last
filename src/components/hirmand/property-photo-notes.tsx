import { useEffect, useMemo, useState } from "react";
import { Check, Image as ImageIcon, MessageSquareText, RotateCcw } from "lucide-react";
import type { Property } from "@/lib/properties";
import { isVideoUrl } from "@/lib/media";
import "@/property-photo-notes.css";

type Notes = Record<string, { note: string; flag: boolean }>;
const KEY = "hirmand-property-photo-notes-v1:";
function safeRead(id: string): Notes { try { const p = JSON.parse(localStorage.getItem(KEY + id) || "{}"); return p && typeof p === "object" ? p : {}; } catch { return {}; } }
export function PropertyPhotoNotes({ property }: { property: Property }) {
  const images = (property.images || []).filter((src) => !isVideoUrl(src));
  const [notes, setNotes] = useState<Notes>(() => safeRead(property.id));
  const [active, setActive] = useState(0);
  const currentData = notes[String(active)] || { note: "", flag: false };
  useEffect(() => { try { localStorage.setItem(KEY + property.id, JSON.stringify(notes)); } catch { /* Storage may be blocked; the in-memory notes still work. */ } }, [notes, property.id]);
  const flagged = useMemo(() => Object.values(notes).filter(x => x && x.flag).length, [notes]);
  if (!images.length) return null;
  const patch = (p: Partial<Notes[string]>) => setNotes(c => ({ ...c, [String(active)]: { ...currentData, ...p } }));
  return <section className="property-photo-notes"><header><div><span className="kicker">یادداشت بازدید</span><h2><ImageIcon size={19} /> یادداشت روی تصاویر ملک</h2><p>برای هر تصویر یک نکته شخصی ثبت کنید؛ مثلاً ترک دیوار، نور کم، وضعیت کابینت یا ایراد تأسیسات.</p></div><span className="property-photo-notes-count">{flagged.toLocaleString("fa-IR")} مورد علامت‌گذاری‌شده</span></header><div className="property-photo-notes-layout"><div className="property-photo-notes-thumbs">{images.map((src, i) => <button key={src + "-" + i} type="button" className={i === active ? "is-active" : ""} onClick={() => setActive(i)}><img src={src} alt={"تصویر " + (i + 1)} loading="lazy" /><small>{(i + 1).toLocaleString("fa-IR")}</small>{notes[String(i)]?.flag ? <b>!</b> : null}</button>)}</div><div className="property-photo-notes-editor"><div className="property-photo-notes-title"><strong>تصویر {(active + 1).toLocaleString("fa-IR")}</strong><button type="button" className={currentData.flag ? "is-flagged" : ""} onClick={() => patch({ flag: !currentData.flag })}><MessageSquareText size={14} /> {currentData.flag ? "علامت‌گذاری شده" : "علامت‌گذاری ایراد"}</button></div><textarea rows={5} value={currentData.note} maxLength={500} onChange={e => patch({ note: e.target.value })} placeholder="مثلاً گوشه تصویر ترک دارد یا نور این بخش ضعیف است..." /><button type="button" className="btn-ghost" onClick={() => setNotes(c => { const n = { ...c }; delete n[String(active)]; return n; })}><RotateCcw size={13} /> پاک‌کردن یادداشت این تصویر</button><div className="property-photo-notes-saved"><Check size={13} /> خودکار ذخیره می‌شود</div></div></div></section>;
}