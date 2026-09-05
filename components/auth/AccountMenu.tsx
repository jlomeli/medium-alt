"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

/**
 * Signed-in account menu. Uses ARIA menu/menuitem roles so the E2E header
 * component object queries `getByRole('menuitem', { name })` naturally.
 *
 * Ordering (see docs/specs/signed-in-nav.md § Menu ordering rationale):
 *   Your profile → Your articles → Settings → Log out.
 *
 * Log out remains a native `<form>` bound to the logout server route so the
 * browser follows the server-issued redirect after the JWT cookie is cleared.
 * The three navigation items are `<Link>`s (client-side navigation, no round
 * trip); only Log out has server-side state to mutate.
 *
 * Keyboard model — WAI-ARIA APG menu-widget pattern:
 *   - Toggle: Enter / Space / ArrowDown open and focus the first item;
 *     ArrowUp opens and focuses the last item.
 *   - Menu: ArrowDown / ArrowUp wrap; Home / End jump to ends; Escape
 *     closes and returns focus to the toggle; Tab (either direction)
 *     closes the menu and lets the browser move to the next / previous
 *     tab stop outside it. Enter on a link menuitem navigates via the
 *     anchor's native activation; Enter on the logout menuitem submits
 *     the form.
 *   - Roving tabindex: only the "active" menuitem has tabindex=0; the
 *     rest have tabindex=-1, keeping the menu a single tab stop.
 *
 * Close-on-navigate: Header lives in the app layout so client-side navigations
 * do NOT remount this component. Without an explicit close, `open` state would
 * persist and `aria-expanded` would stay "true" after the destination page
 * renders. Two-layer defense: each link's onClick calls setOpen(false), and
 * a useEffect on usePathname() covers programmatic navigations that skip the
 * onClick path.
 */

type LinkItem = { readonly kind: "link"; readonly label: string; readonly href: string };
type LogoutItem = { readonly kind: "logout"; readonly label: "Log out" };
type MenuItem = LinkItem | LogoutItem;

const ITEMS: readonly MenuItem[] = [
  { kind: "link", label: "Your profile", href: "/me" },
  { kind: "link", label: "Your articles", href: "/me/articles" },
  { kind: "link", label: "Settings", href: "/me/edit" },
  { kind: "logout", label: "Log out" },
];

export function AccountMenu({ userLabel }: { userLabel: string }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const pathname = usePathname();

  // Outside-click close. Bound only while open so we don't churn listeners.
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  // Close-on-navigate. Fires on mount too (pathname is defined immediately),
  // but that's a no-op since initial state is closed.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Roving focus. Whenever the menu is open, whichever item is the active
  // index owns focus. Also fires on open→true so the first (or last) item
  // is focused right after keyboard-triggered open.
  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  function openMenuAt(index: number) {
    setActiveIndex(index);
    setOpen(true);
  }

  function handleToggleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "Enter":
      case " ":
      case "ArrowDown":
        // preventDefault on Enter/Space suppresses the synthesized click that
        // would otherwise re-invoke the onClick handler and toggle back.
        event.preventDefault();
        openMenuAt(0);
        break;
      case "ArrowUp":
        event.preventDefault();
        openMenuAt(ITEMS.length - 1);
        break;
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % ITEMS.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + ITEMS.length) % ITEMS.length);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(ITEMS.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        toggleRef.current?.focus();
        break;
      case "Tab":
        // Do NOT preventDefault — the browser needs to move focus to the
        // next tab stop. Roving tabindex means only the active menuitem is
        // in tab order, so Tab / Shift+Tab naturally exit the menu. We just
        // close it on the way out.
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={toggleRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        onClick={() => (open ? setOpen(false) : openMenuAt(0))}
        onKeyDown={handleToggleKeyDown}
        className="rounded-md border px-3 py-1.5 text-sm"
      >
        {userLabel}
      </button>
      {open && (
        <div
          role="menu"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 mt-1 w-40 rounded-md border bg-white shadow-md"
        >
          {ITEMS.map((item, i) => {
            const tabIndex = i === activeIndex ? 0 : -1;
            const itemClass =
              "block w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none";
            if (item.kind === "link") {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  tabIndex={tabIndex}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  onClick={() => setOpen(false)}
                  onFocus={() => setActiveIndex(i)}
                  className={itemClass}
                >
                  {item.label}
                </Link>
              );
            }
            return (
              <form key="logout" action="/api/logout" method="post">
                <button
                  type="submit"
                  role="menuitem"
                  tabIndex={tabIndex}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  onFocus={() => setActiveIndex(i)}
                  className={itemClass}
                >
                  {item.label}
                </button>
              </form>
            );
          })}
        </div>
      )}
    </div>
  );
}
