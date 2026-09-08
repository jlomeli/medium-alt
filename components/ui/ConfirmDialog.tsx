"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface ConfirmDialogProps {
  /** Controls mount. When `false`, the dialog renders nothing. */
  open: boolean;
  /** `id` of the element that names the dialog (its heading). Bound via `aria-labelledby`. */
  labelledBy: string;
  /** Fires on Escape and backdrop click. Callers may no-op it (e.g. mid-request lockout). */
  onDismiss: () => void;
  /** Full dialog contents — heading + body + buttons. Composed by the caller so per-state layouts stay readable. */
  children: ReactNode;
}

/**
 * Focus-trapped modal shell for destructive-action confirmations —
 * designed to be reused by future destructive flows (delete comment,
 * unfollow-with-confirm, delete account) as flagged in
 * `docs/specs/articles-delete-ui.md` § UI surface.
 *
 * Contract:
 * - `role="dialog"`, `aria-modal="true"`, `aria-labelledby={labelledBy}`.
 * - Escape (bound on `document` while open) and backdrop click →
 *   `onDismiss()`. Caller decides whether to actually close (e.g.
 *   mid-request lockout ignores).
 * - On mount: focus lands on the first tabbable element in the panel.
 *   Callers put `Cancel` first in DOM order so that "initial focus is
 *   the safe action" (spec § Accessibility) falls out naturally.
 * - On close: focus is restored to the element that was focused when
 *   the dialog opened — typically the trigger `<button>` that toggled
 *   `open`.
 * - Focus recovery: if the panel's children change (state-machine
 *   transition unmounts the currently-focused button) and focus lands
 *   outside the panel, focus is pulled back to the first tabbable
 *   inside — Escape/Tab stay wired.
 * - Tab / Shift+Tab wrap within the dialog's focusables.
 */
export function ConfirmDialog({
  open,
  labelledBy,
  onDismiss,
  children,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Kept in a ref so the document-level Escape listener doesn't need
  // `onDismiss` in its effect deps — rebinding on every render would
  // race with in-flight key events and add noise to the effect graph.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return;
    // Snapshot whoever had focus so we can restore it on close.
    // `useEffect` runs after commit, so the panel's focusables are
    // already in the DOM — no microtask defer needed.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = getFocusable(panelRef.current);
    focusables[0]?.focus();
    return () => {
      // If the trigger is still mounted (the common case — dialog
      // closed but page stays) it regains focus; if the page has
      // navigated away, the ref points at a detached node and
      // `.focus()` is a no-op.
      previouslyFocused?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Bind Escape on `document` rather than the panel's `onKeyDown`.
    // State-machine transitions inside the panel (e.g. Delete →
    // session-expired unmounts the currently-focused Delete button)
    // briefly park focus on `<body>`; a panel-scoped keydown handler
    // would miss Escape presses in that window.
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismissRef.current();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    // Focus recovery — runs on every child re-render (children identity
    // churns per render, so this fires whenever the panel's contents
    // change). If a state transition unmounted the focused element and
    // focus escaped to `<body>`, pull it back to the first tabbable so
    // Tab wrap and keyboard interaction keep working. When focus is
    // already inside the panel this is a no-op.
    if (!panel.contains(document.activeElement)) {
      const focusables = getFocusable(panel);
      focusables[0]?.focus();
    }
  }, [open, children]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        // Only fire on the backdrop itself; clicks on the inner panel or
        // its buttons must not close the dialog.
        if (e.target === e.currentTarget) onDismiss();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const focusables = getFocusable(panelRef.current);
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md rounded-md bg-white p-4 shadow-lg"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Query for elements that participate in the tab sequence. Kept
 * deliberately conservative — matches links with `href`, form controls,
 * and anything with an explicit non-negative tabindex; skips disabled
 * form controls and `tabindex="-1"`. Sufficient for the confirmation-
 * dialog use case; a more exhaustive matcher can land when a reuse
 * demands it.
 */
function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  const selector =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}
