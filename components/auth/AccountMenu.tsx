"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Signed-in menu. Uses ARIA menu/menuitem roles so the E2E header component
 * object queries `getByRole('menuitem', { name: 'Log out' })` naturally.
 *
 * Log out submits a native `<form>` bound to a server action so the browser
 * follows the server-issued redirect after the JWT cookie is cleared.
 */
export function AccountMenu({ userLabel }: { userLabel: string }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border px-3 py-1.5 text-sm"
      >
        {userLabel}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-40 rounded-md border bg-white shadow-md"
        >
          <form action="/api/logout" method="post">
            <button
              type="submit"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-100"
            >
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
