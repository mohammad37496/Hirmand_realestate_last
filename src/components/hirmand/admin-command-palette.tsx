import { useEffect, useMemo, useState } from "react";
import { Command, Search, X } from "lucide-react";

type Item = { id: string; label: string; description?: string };

export function AdminCommandPalette(props: {
  items: Item[];
  onSelect: (id: string) => void;
  onNewProperty?: () => void;
  onRefresh?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      if (!typing && event.key === "/") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => document.getElementById("admin-command-palette-input")?.focus(), 0);
    else setQuery("");
  }, [open]);

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fa");
    return needle ? props.items.filter((item) => (item.label + " " + (item.description ?? "")).toLocaleLowerCase("fa").includes(needle)) : props.items;
  }, [props.items, query]);

  function choose(id: string) {
    setOpen(false);
    props.onSelect(id);
  }

  return (
    <>
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)} title="جستجوی سریع">
        <Command size={14} /> جستجوی سریع <kbd>Ctrl K</kbd>
      </button>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label="جستجوی سریع پنل مدیریت" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(6,13,15,.52)", display: "grid", placeItems: "start center", padding: "12vh 18px 24px" }} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div style={{ width: "min(680px,100%)", maxHeight: "72vh", overflow: "auto", background: "var(--card,#fff)", border: "1px solid var(--line)", borderRadius: 16, boxShadow: "0 24px 80px rgba(0,0,0,.28)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 12, borderBottom: "1px solid var(--line)" }}>
              <Search size={17} />
              <input id="admin-command-palette-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="مثلاً: درخواست‌ها، پشتیبان، فایل جدید…" style={{ flex: 1, border: 0, outline: 0, background: "transparent", font: "inherit" }} />
              <button type="button" className="admin-icon-btn" onClick={() => setOpen(false)} aria-label="بستن"><X size={16}/></button>
            </div>
            <div style={{ display: "grid", gap: 4, padding: 8 }}>
              {props.onNewProperty ? (
                <button type="button" className="admin-nav-btn" style={{ color: "var(--navy-900,#253744)", background: "var(--surface-2,#f7f5f0)" }} onClick={() => { setOpen(false); props.onNewProperty?.(); }}>
                  افزودن فایل جدید
                </button>
              ) : null}
              {props.onRefresh ? (
                <button type="button" className="admin-nav-btn" style={{ color: "var(--navy-900,#253744)" }} onClick={() => { setOpen(false); props.onRefresh?.(); }}>
                  به‌روزرسانی داده‌ها
                </button>
              ) : null}
              {matches.map((item) => (
                <button key={item.id} type="button" className="admin-nav-btn" style={{ color: "var(--navy-900,#253744)" }} onClick={() => choose(item.id)}>
                  <span style={{ display: "block", fontWeight: 900 }}>{item.label}</span>
                  {item.description ? <small style={{ display: "block", color: "var(--muted)" }}>{item.description}</small> : null}
                </button>
              ))}
              {!matches.length ? <div className="admin-empty">موردی پیدا نشد.</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
