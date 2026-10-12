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
}: {
  open: boolean;
  onClose: () => void;
  /** Element that should receive focus when the overlay opens. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

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
      }
    }
    document.addEventListener("keydown", onKeyDown);

    const focusTarget = initialFocusRef?.current;
    (focusTarget ?? restoreFocusRef.current)?.focus?.();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = previousOverflow;
      body.style.paddingInlineEnd = previousPadding;
      // Returning focus is what keeps a keyboard user from being dumped at the
      // top of the document when an overlay closes.
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose, initialFocusRef]);
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

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
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
  useOverlayDismiss({ open: Boolean(request), onClose: closeRequest });

  const dialog = request ? (
    <AdminConfirmDialog request={request} onSettle={settle} />
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
