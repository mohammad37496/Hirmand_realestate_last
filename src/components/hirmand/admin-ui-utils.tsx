/**
 * Admin behaviour helpers.
 *
 * Kept apart from `admin-ui.tsx` on purpose: that file renders the shared
 * dialog / skeleton / pagination components and should export components
 * only, otherwise React Fast Refresh has to fall back to a full reload every
 * time an admin-only file is edited while developing.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminConfirmDialog } from "@/components/hirmand/admin-ui";

/* ------------------------------------------------------------------ */
/* Overlay behaviour — Escape, scroll lock and focus return            */
/* ------------------------------------------------------------------ */

/**
 * Everything a panel that covers the page has to do and nothing it must not.
 *
 * Without this each overlay grew its own half-implementation: the confirm
 * dialog knew Escape but not the scrollbar, the nav drawer knew neither and
 * left focus on the hamburger behind the backdrop. A phone user could scroll
 * the page underneath an open drawer, and a keyboard user could tab straight
 * out of a modal.
 */
export function useOverlayDismiss({
  open,
  onClose,
  initialFocusRef,
  restoreFocusRef,
  containerRef,
}: {
  open: boolean;
  onClose: () => void;
  /** Element that should receive focus when the overlay opens. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Element that should regain focus when the overlay closes. */
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
  /** Optional modal root whose tabbable descendants must contain keyboard focus. */
  containerRef?: React.RefObject<HTMLElement | null>;
}) {
  const activeElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    activeElementRef.current = restoreFocusRef
      ? restoreFocusRef.current
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // Lock the page but keep the scrollbar's width, otherwise locking shifts
    // the whole layout sideways on a desktop window.
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingInlineEnd;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingInlineEnd = `${scrollbar}px`;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !containerRef?.current) return;
      const container = containerRef.current;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
        ),
      ).filter(
        (element) =>
          !element.matches(":disabled") &&
          !element.closest('[inert], [aria-hidden="true"]') &&
          getComputedStyle(element).visibility !== "hidden" &&
          element.getClientRects().length > 0,
      );

      if (!focusable.length) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === container || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    const focusTarget = initialFocusRef?.current;
    // Some dialogs (notably AdminConfirmDialog) manage their own initial focus
    // in a child effect; do not steal focus back to the opener here.
    focusTarget?.focus?.();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = previousOverflow;
      body.style.paddingInlineEnd = previousPadding;
      // Returning focus is what keeps a keyboard user from being dumped at the
      // top of the document when an overlay closes.
      activeElementRef.current?.focus?.();
    };
  }, [open, onClose, initialFocusRef, restoreFocusRef, containerRef]);
}

/* ------------------------------------------------------------------ */
/* Busy guard — one submit per operation, even on a double click.      */
/* ------------------------------------------------------------------ */

/**
 * Wraps an async action so a second click while the first is still in flight
 * is ignored instead of firing a duplicate mutation. `pending` re-renders
 * callers so they can disable their own button.
 */
export function useGuardedAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<void>,
) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (...args: Args) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      try {
        await action(...args);
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [action],
  );

  return { run, pending };
}

/* ------------------------------------------------------------------ */
/* Confirmation dialog                                                 */
/* ------------------------------------------------------------------ */

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  /** Bullet list rendered inside the dialog — used for bulk operations. */
  items?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

export type ConfirmRequest = ConfirmOptions & { resolve: (ok: boolean) => void };

/**
 * Promise-based confirm so call sites read as
 * `if (!(await confirm({...}))) return;` instead of every component owning
 * its own modal markup. Renders nothing until a request exists.
 */
export function useConfirmDialog() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      // Capture the invoking control before React mounts the dialog. Its child
      // effect focuses the confirm button before this hook's effect runs.
      if (!dialogRef.current) {
        openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      setRequest({ ...options, resolve });
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    setRequest((current) => {
      current?.resolve(ok);
      return null;
    });
  }, []);

  const closeRequest = useCallback(() => settle(false), [settle]);
  useOverlayDismiss({
    open: Boolean(request),
    onClose: closeRequest,
    restoreFocusRef: openerRef,
    containerRef: dialogRef,
  });

  const dialog = request ? (
    <AdminConfirmDialog request={request} onSettle={settle} dialogRef={dialogRef} />
  ) : null;

  return { confirm, dialog };
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const FA = new Intl.NumberFormat("fa-IR");

export function fa(value: number): string {
  return FA.format(Number.isFinite(value) ? value : 0);
}

export function faBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "۰ بایت";
  if (bytes < 1024) return `${fa(bytes)} بایت`;
  if (bytes < 1024 * 1024) return `${fa(Math.round(bytes / 1024))} کیلوبایت`;
  return `${(bytes / 1024 / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} مگابایت`;
}

/** Turns any thrown value into a Persian, non-technical message. */
export function adminErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
