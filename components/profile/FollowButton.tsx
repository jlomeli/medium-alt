"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * `<FollowButton>` — Follow / Unfollow toggle on `/profiles/[username]`.
 *
 * `initialFollowing` is derived server-side by the parent page from the
 * `Follow` table. After a POST or DELETE resolves, we call
 * `router.refresh()` so the server component re-reads the DB and the
 * label reflects committed state — no optimistic UI in this slice
 * (that concern belongs to slice 7 / Claps).
 *
 * The button hits `POST` or `DELETE` on `/api/users/{username}/follow`
 * — the same endpoints the E2E API tests exercise. Wiring the UI
 * through the public HTTP surface (rather than a server action) means
 * one code path serves both the UI and the framework's factories.
 *
 * Anonymous callers get a plain `<a>` to `/login?callbackUrl=...`
 * instead — see the parent page's render logic. This component is
 * only mounted when there IS a signed-in viewer (`viewerAuthed`
 * true), so the fetches never fire without a session cookie.
 */
export function FollowButton({
  username,
  initialFollowing,
}: {
  username: string;
  initialFollowing: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const following = initialFollowing;
  const label = following ? "Unfollow" : "Follow";

  async function onClick() {
    const method = following ? "DELETE" : "POST";
    const res = await fetch(
      `/api/users/${encodeURIComponent(username)}/follow`,
      { method },
    );
    // 200 (idempotent repeat), 201 (created), and 204 (deleted) are
    // all successes. Any other status means the button state is
    // stale — surface it in the console and let the next refresh
    // reconcile.
    if (!res.ok && res.status !== 204) {
      console.error(
        `Follow toggle failed: ${method} ${res.status} — ${await res.text()}`,
      );
      return;
    }
    // `startTransition` marks the router.refresh() as a low-priority
    // update so the button stays responsive to a second click during
    // the round-trip. The refresh re-runs the server component,
    // which re-reads `isFollowing` from the DB — the new label is
    // authoritative, not optimistic.
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={following}
      className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
