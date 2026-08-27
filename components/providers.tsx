"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Client-side providers. Kept minimal — SessionProvider is what `signIn()`
 * from `next-auth/react` needs to work inside client components (login form,
 * register form, password-reset confirm).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
