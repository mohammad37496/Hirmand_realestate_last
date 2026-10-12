import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Phone } from "lucide-react";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { useConsultants } from "./consultants-context";

export function CallMenu({
  className,
  buttonClassName,
  label = "تماس",
  align = "start",
}: {
  className?: string;
  buttonClassName?: string;
  label?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const consultants = useConsultants();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={cn("action-menu", className)} ref={rootRef}>
      <button
        type="button"
        className={cn("btn-gold", buttonClassName)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <Phone size={16} strokeWidth={2.2} />
        {label}
        <ChevronDown size={14} className={cn("menu-caret", open && "is-open")} />
      </button>
      {open ? (
        <div id={menuId} role="menu" className={cn("action-menu-panel", align === "end" && "is-end")}>
          {consultants.map((person) => (
            <a key={person.id} role="menuitem" href={`tel:${person.phone}`} onClick={() => { trackAnalyticsEvent("call_click"); setOpen(false); }}>
              <span>
                <strong>{person.name}</strong>
                <small>{person.role}</small>
              </span>
              <em dir="ltr">{person.phoneDisplay}</em>
            </a>
          ))}
          <a role="menuitem" href={`tel:${SITE.phone.office}`} onClick={() => setOpen(false)}>
            <span>
              <strong>تلفن دفتر</strong>
              <small>پاسخگویی با هماهنگی</small>
            </span>
            <em dir="ltr">{SITE.phone.officeDisplay}</em>
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function MapMenu({
  google,
  balad,
  neshan,
  label = "موقعیت املاک",
  buttonClassName,
  icon,
  align = "start",
}: {
  google: string;
  balad: string;
  neshan: string;
  label?: string;
  buttonClassName?: string;
  icon?: ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const apps = [
    { href: google, title: "گوگل مپ", text: "Google Maps" },
    { href: balad, title: "بلد", text: "مسیریابی فارسی" },
    { href: neshan, title: "نشان", text: "نقشه و مسیر" },
  ];

  return (
    <div className="action-menu" ref={rootRef}>
      <button
        type="button"
        className={cn("btn-ghost", buttonClassName)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
        {label}
        <ChevronDown size={14} className={cn("menu-caret", open && "is-open")} />
      </button>
      {open ? (
        <div id={menuId} role="menu" className={cn("action-menu-panel", align === "end" && "is-end")}>
          {apps.map((app) => (
            <a
              key={app.title}
              role="menuitem"
              href={app.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
            >
              <span>
                <strong>{app.title}</strong>
                <small>{app.text}</small>
              </span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
