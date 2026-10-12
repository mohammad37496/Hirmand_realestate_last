import { useRef, useState } from "react";
import { Check, Download, HardDrive, RotateCcw, Upload } from "lucide-react";
import "@/workspace-backup.css";

const EXCLUDED = new Set(["hirmand-music-state"]);
function collect() {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith("hirmand-") || EXCLUDED.has(key)) continue;
    const value = localStorage.getItem(key);
    if (value != null) data[key] = value;
  }
  return data;
}
export function WorkspaceBackupRestore() {
  const [status, setStatus] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const exportData = () => {
    const payload = { version: 1, exportedAt: new Date().toISOString(), storage: collect() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "hirmand-workspace-backup.json"; a.click();
    URL.revokeObjectURL(url); setStatus("نسخه پشتیبان دانلود شد.");
  };
  const importData = async (file: File) => {
    try {
      const payload = JSON.parse(await file.text());
      const storage = payload && payload.storage;
      if (!storage || typeof storage !== "object" || Array.isArray(storage)) throw new Error("invalid");
      let count = 0;
      for (const [key, value] of Object.entries(storage)) {
        if (!key.startsWith("hirmand-") || EXCLUDED.has(key) || typeof value !== "string") continue;
        localStorage.setItem(key, value); count += 1;
      }
      setStatus(count.toLocaleString("fa-IR") + " مورد بازیابی شد. صفحه را تازه کنید.");
    } catch { setStatus("فایل پشتیبان معتبر نیست."); }
    finally { if (inputRef.current) inputRef.current.value = ""; }
  };
  return <section className="workspace-backup"><header><div><span className="kicker">امنیت اطلاعات شخصی</span><h2><HardDrive size={19} /> پشتیبان‌گیری از فضای کاری</h2><p>تنظیمات و یادداشت‌های شخصی ابزارهای هیرمند را به فایل JSON محلی تبدیل کنید؛ فایل به سرور ارسال نمی‌شود.</p></div><Check size={22} /></header><div className="workspace-backup-actions"><button type="button" className="btn-gold" onClick={exportData}><Download size={15} /> دریافت پشتیبان</button><button type="button" className="btn-ghost" onClick={() => inputRef.current?.click()}><Upload size={15} /> بازیابی پشتیبان</button><input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void importData(f); }} /></div>{status ? <p className="workspace-backup-status"><RotateCcw size={14} />{status}</p> : null}</section>;
}