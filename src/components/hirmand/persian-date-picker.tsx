import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, RotateCcw, X } from "lucide-react";
import { DayPicker, faIR } from "react-day-picker/persian";
import "react-day-picker/style.css";
import {
  dateOnlyToLocalDate,
  formatPersianDateWithWeekday,
  localDateToDateOnly,
} from "@/lib/persian-date";

type PersianDatePickerProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  title?: string;
  minValue?: string;
  disabled?: boolean;
};

export function PersianDatePicker({
  id,
  value,
  onChange,
  placeholder = "انتخاب تاریخ شمسی",
  hint = "تاریخ با تقویم شمسی انتخاب می‌شود.",
  title = "انتخاب تاریخ",
  minValue,
  disabled = false,
}: PersianDatePickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const selectedDate = dateOnlyToLocalDate(value);
  const minDate = minValue ? dateOnlyToLocalDate(minValue) : undefined;

  function positionPopover() {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover || typeof window === "undefined") return;

    const triggerRect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const preferredWidth = window.innerWidth <= 720 ? 390 : 370;
    const width = Math.min(preferredWidth, window.innerWidth - viewportPadding * 2);

    let left = triggerRect.right - width;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - width - viewportPadding));

    let top = triggerRect.bottom + 9;
    const popoverRect = popover.getBoundingClientRect();
    if (
      top + popoverRect.height > window.innerHeight - viewportPadding &&
      triggerRect.top - popoverRect.height - 9 >= viewportPadding
    ) {
      top = triggerRect.top - popoverRect.height - 9;
    }

    setPopoverStyle({
      position: "fixed",
      top: String(Math.round(top)) + "px",
      left: String(Math.round(left)) + "px",
      width: String(Math.round(width)) + "px",
    });
  }

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onViewportChange = () => positionPopover();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    const frame = window.requestAnimationFrame(() => positionPopover());

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  function selectDate(date: Date | undefined) {
    const nextValue = localDateToDateOnly(date);
    onChange(nextValue);
    if (date) setOpen(false);
  }

  return (
    <div className="persian-date-picker">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={"persian-date-picker-trigger" + (value ? " has-value" : "")}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
      >
        <CalendarDays size={18} aria-hidden="true" />
        <span>{value ? formatPersianDateWithWeekday(value) : placeholder}</span>
      </button>

      {hint ? <small className="form-hint">{hint}</small> : null}

      {value ? (
        <button
          type="button"
          className="persian-date-picker-clear"
          onClick={() => {
            onChange("");
            setOpen(false);
          }}
          disabled={disabled}
          aria-label="پاک کردن تاریخ"
          title="پاک کردن تاریخ"
        >
          <X size={15} aria-hidden="true" />
        </button>
      ) : null}

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              className="persian-date-picker-popover"
              role="dialog"
              aria-label="انتخاب تاریخ شمسی"
              style={popoverStyle}
            >
          <div className="persian-date-picker-head">
            <div>
              <span>{title}</span>
              <strong>{value ? formatPersianDateWithWeekday(value) : "یک تاریخ انتخاب کنید"}</strong>
            </div>
            <button
              type="button"
              className="persian-date-picker-close"
              onClick={() => setOpen(false)}
              aria-label="بستن تقویم"
              title="بستن"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="persian-date-picker-calendar-guide">
            <span>ماه و سال را از بالا انتخاب کنید</span>
            <b>سپس روز موردنظر را انتخاب کنید</b>
          </div>

          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={selectDate}
            defaultMonth={selectedDate ?? new Date()}
            locale={faIR}
            dir="rtl"
            numerals="arabext"
            captionLayout="dropdown"
            navLayout="after"
            reverseYears
            showOutsideDays={false}
            disabled={minDate ? { before: minDate } : undefined}
          />

          {value ? (
            <button type="button" className="persian-date-picker-reset" onClick={() => onChange("")}>
              <RotateCcw size={14} aria-hidden="true" />
              حذف تاریخ انتخاب‌شده
            </button>
          ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
