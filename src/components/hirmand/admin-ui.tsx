/**
 * Shared admin primitives.
 *
 * The panel previously used `window.confirm`, a spinner with the words
 * "در حال بارگذاری…" and hand-rolled busy flags in every component. These
 * pieces replace all of that with one accessible, RTL-friendly implementation
 * so dialogs, loading and pagination behave the same everywhere and stay
 * consistent as the panel grows.
 *
 * Components only — the hooks and formatters live in `admin-ui-utils.ts` so
 * React Fast Refresh does not have to fall back to a full reload when an
 * admin file changes.
 */

import { useEffect, useId, useMemo, useRef } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, RefreshCw, X } from "lucide-react";
import type { ConfirmRequest } from "@/components/hirmand/admin-ui-utils";

/* ------------------------------------------------------------------ */
/* Confirmation dialog                                                 */
/* ------------------------------------------------------------------ */

export function AdminConfirmDialog({
  request,
  onSettle,
}: {
  request: ConfirmRequest;
  onSettle: (ok: boolean) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onSettle(false);
        return;
      }
      if (event.key !== "Tab") return;

      // Keep focus inside the dialog: a modal the keyboard can walk out of is
      // worse than no modal at all.
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || !focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onSettle]);

  return (
    <div
      className="admin-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onSettle(false);
      }}
    >
      <div
        className="admin-dialog"
        data-tone={request.tone ?? "default"}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={request.description || request.items?.length ? descriptionId : undefined}
        ref={dialogRef}
      >
        <span className="admin-dialog-icon" aria-hidden="true">
          <AlertTriangle size={22} />
        </span>
        <h3 id={titleId}>{request.title}</h3>
        {request.description ? <p id={descriptionId}>{request.description}</p> : null}
        {request.items?.length ? (
          <div className="admin-dialog-list" id={request.description ? undefined : descriptionId}>
            {request.items.map((item) => (
              <div key={item}>· {item}</div>
            ))}
          </div>
        ) : null}
        <div className="admin-dialog-actions">
          {request.tone === "danger" ? (
            <button
              type="button"
              className="btn-danger-solid"
              ref={confirmRef}
              onClick={() => onSettle(true)}
            >
              {request.confirmLabel ?? "بله، انجام بده"}
            </button>
          ) : (
            <button
              type="button"
              className="btn-gold"
              ref={confirmRef}
              onClick={() => onSettle(true)}
            >
              {request.confirmLabel ?? "تأیید"}
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={() => onSettle(false)}>
            {request.cancelLabel ?? "انصراف"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Skeletons                                                           */
/* ------------------------------------------------------------------ */

export function AdminSkeletonLine({ width = "100%", height = 12 }: { width?: string; height?: number }) {
  return (
    <span
      className="admin-skeleton admin-skeleton-line"
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

/** Placeholder that matches the shape of a property row. */
export function AdminListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">در حال بارگذاری فهرست…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div className="admin-skeleton-row" key={index}>
          <span className="admin-skeleton" style={{ width: 64, height: 48, flex: "0 0 auto" }} />
          <span style={{ flex: 1, display: "grid", gap: 8 }}>
            <AdminSkeletonLine width="42%" />
            <AdminSkeletonLine width="70%" height={10} />
          </span>
          <span className="admin-skeleton" style={{ width: 108, height: 36, flex: "0 0 auto" }} />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for card grids (dashboard stats, consultants, music). */
export function AdminCardSkeleton({ count = 4, height = 96 }: { count?: number; height?: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{ display: "grid", gap: 12, gridTemplateColumns: `repeat(auto-fill, minmax(190px, 1fr))` }}
    >
      <span className="sr-only">در حال بارگذاری…</span>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="admin-skeleton" style={{ height }} />
      ))}
    </div>
  );
}

/** Inline spinner with a real accessible label. */
export function AdminSpinner({ label = "در حال انجام…" }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <Loader2 size={18} className="admin-spin" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Error banner                                                        */
/* ------------------------------------------------------------------ */

/** Shows a recoverable failure in place of silently swallowing it. */
export function AdminErrorBanner({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: "12px 16px",
        borderRadius: 14,
        border: "1px solid #f2c3bf",
        background: "#fdf2f1",
        color: "#8f2119",
        fontSize: ".86rem",
      }}
    >
      <AlertTriangle size={18} aria-hidden="true" style={{ flex: "0 0 auto" }} />
      <span style={{ flex: 1, minWidth: 180 }}>{message}</span>
      {onRetry ? (
        <button type="button" className="btn-ghost" onClick={onRetry}>
          <RefreshCw size={15} /> تلاش دوباره
        </button>
      ) : null}
      {onDismiss ? (
        <button type="button" className="admin-icon-btn" onClick={onDismiss} aria-label="بستن پیام خطا">
          <X size={15} />
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

/** `1 … 4 5 6 … 20` — always shows first, last and a window around current. */
function pageWindow(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = new Set<number>([1, total, current]);
  for (const offset of [-1, 1]) {
    const candidate = current + offset;
    if (candidate > 1 && candidate < total) pages.add(candidate);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) result.push("gap");
    result.push(page);
    previous = page;
  }
  return result;
}

export function AdminPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  busy,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  busy?: boolean;
}) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const pages = useMemo(() => pageWindow(Math.min(page, pageCount), pageCount), [page, pageCount]);

  return (
    <div className="admin-pagination">
      <span className="admin-pagination-meta" aria-live="polite">
        {total === 0
          ? "نتیجه‌ای وجود ندارد"
          : `نمایش ${first.toLocaleString("fa-IR")} تا ${last.toLocaleString("fa-IR")} از ${total.toLocaleString("fa-IR")}`}
      </span>

      <div className="admin-pagination-pages">
        <button
          type="button"
          className="admin-page-btn"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={busy || page <= 1}
          aria-label="صفحه قبل"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>

        {pages.map((entry, index) =>
          entry === "gap" ? (
            <span className="admin-page-ellipsis" key={`gap-${index}`} aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              className={"admin-page-btn" + (entry === page ? " is-active" : "")}
              aria-current={entry === page ? "page" : undefined}
              aria-label={`صفحه ${entry.toLocaleString("fa-IR")}`}
              onClick={() => onPageChange(entry)}
              disabled={busy}
            >
              {entry.toLocaleString("fa-IR")}
            </button>
          ),
        )}

        <button
          type="button"
          className="admin-page-btn"
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          disabled={busy || page >= pageCount}
          aria-label="صفحه بعد"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
      </div>

      {onPageSizeChange ? (
        <label className="admin-pagination-meta" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          در هر صفحه
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            aria-label="تعداد نتیجه در هر صفحه"
            style={{
              minHeight: 40,
              borderRadius: 11,
              border: "1px solid var(--line)",
              background: "#fff",
              color: "var(--fg)",
              font: "inherit",
              fontSize: ".82rem",
              padding: "6px 10px",
            }}
          >
            {[20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size.toLocaleString("fa-IR")}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
