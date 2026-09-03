"use client";

/**
 * `<ClapButton>` — the read-page clap affordance. See docs/specs/claps.md
 * § UI surface.
 *
 * Two variants, decided at render time by the parent:
 *   1. Signed-in + viewer is NOT the article's author — renders a
 *      `<button>` that layers a pending delta on top of the server-
 *      truth count. Click bumps the visible count immediately (the
 *      whole reason this slice exists) via plain `useState`; the
 *      POST fires in the background and reduces the overlay by the
 *      applied amount on response. Multiple rapid clicks queue up
 *      as one `delta: N` batch behind a single in-flight request.
 *      We deliberately do NOT use `useOptimistic` here: its "value
 *      is visible only for the duration of one action" contract
 *      does not survive the queued-click drain path, so a plain
 *      pending-delta state gives predictable semantics for the
 *      whole tap-storm lifecycle.
 *   2. Signed-in + viewer IS the author — this component is NOT
 *      rendered at all (the parent RSC checks `isAuthor` and emits
 *      only the static `<ClapCount>` instead). Kept OUT of this
 *      component so the button's DOM absence in the "own article"
 *      case is a compile-time property of the parent, not a runtime
 *      branch that could regress silently.
 *   3. Anonymous — renders an `<a>` to
 *      `/login?callbackUrl=<article-path>`. No JS handler needed;
 *      the link is the affordance. Same auth-gate pattern as
 *      `<FollowButton>` in slice 6.
 *
 * Cap enforcement: the client mirrors the server cap
 * (`MAX_CLAPS_PER_VIEWER`) so a click at 50 is a visible no-op — no
 * doomed POST, no confusing "why didn't it go up" moment. The
 * authoritative cap is still the service's.
 *
 * Error revert: a failed POST reverts the optimistic delta and
 * surfaces a `role="alert"` — the viewer is never lied to about
 * what actually saved. Button stays enabled so a retry is one click
 * away.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { MAX_CLAPS_PER_VIEWER } from "@/lib/validation/claps";
import { ClapCount } from "./ClapCount";

interface ServerClapState {
  viewerCount: number;
  totalCount: number;
}

interface ClapButtonSignedInProps {
  variant: "signed-in";
  slug: string;
  initialViewerCount: number;
  initialTotalCount: number;
}

interface ClapButtonAnonProps {
  variant: "anonymous";
  slug: string;
  initialTotalCount: number;
  /** Absolute path to the article — used as `?callbackUrl=`. */
  articlePath: string;
}

export type ClapButtonProps = ClapButtonSignedInProps | ClapButtonAnonProps;

export function ClapButton(props: ClapButtonProps) {
  if (props.variant === "anonymous") {
    return <AnonymousClapLink {...props} />;
  }
  return <SignedInClapButton {...props} />;
}

// ---------------------------------------------------------------------------
// Anonymous — a link that bounces through /login. No JS state to manage.
// ---------------------------------------------------------------------------

function AnonymousClapLink({
  initialTotalCount,
  articlePath,
}: ClapButtonAnonProps) {
  const href = `/login?callbackUrl=${encodeURIComponent(articlePath)}`;
  return (
    <div className="flex items-center gap-3">
      <Link
        href={href}
        // The accessible name matches the signed-in button so tests
        // (and screen-reader users) find the same affordance
        // regardless of session state. `getByRole("link", { name:
        // /^Clap for this article/ })` in the POM picks this up.
        aria-label={`Clap for this article (sign in to add claps, currently ${initialTotalCount})`}
        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50"
      >
        <span aria-hidden="true">♥</span> Clap
      </Link>
      <ClapCount count={initialTotalCount} label="Total claps" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signed-in — useOptimistic, batched POST, error revert.
// ---------------------------------------------------------------------------

function SignedInClapButton({
  slug,
  initialViewerCount,
  initialTotalCount,
}: ClapButtonSignedInProps) {
  // Server-truth state. Updated only when a POST returns successfully.
  const [committed, setCommitted] = useState<ServerClapState>({
    viewerCount: initialViewerCount,
    totalCount: initialTotalCount,
  });
  // Pending delta layered on top of `committed` for the optimistic
  // render. Bumped in the click handler *before* the fetch fires;
  // reduced by the applied amount when the POST returns; cleared
  // outright on error. Kept as plain `useState` rather than
  // `useOptimistic` because we need the pending value to survive
  // across an arbitrary number of clicks + one batched drain POST,
  // and useOptimistic's "visible only for the duration of one
  // action" contract does not fit that lifecycle: a queued click's
  // sync `startTransition(() => addOptimistic(1))` ends the moment
  // its callback returns, reverting its +1 before the DOM ever
  // renders it.
  const [pendingDelta, setPendingDelta] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Batching queue. Between the moment a click fires and the moment
  // its POST responds, subsequent clicks accumulate here rather than
  // firing their own POSTs. When the in-flight request settles, if
  // the queue is non-empty we drain it as a single `delta: N` POST.
  //
  // This keeps the fastest tap-storm on the network at N ≈ 2 requests
  // total (one initial + one drain) rather than N requests — a
  // pragmatic tradeoff that costs one round-trip of latency on the
  // *final* clap but eliminates per-click server load.
  const pendingRef = useRef(0);
  const inFlightRef = useRef(false);

  const displayedViewerCount = Math.min(
    committed.viewerCount + pendingDelta,
    MAX_CLAPS_PER_VIEWER,
  );
  const displayedTotalCount = committed.totalCount + pendingDelta;

  async function flushDelta(delta: number) {
    inFlightRef.current = true;
    try {
      const res = await fetch(
        `/api/articles/${encodeURIComponent(slug)}/claps`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ delta }),
        },
      );
      if (!res.ok) throw new Error(`POST /claps returned ${res.status}`);
      const body = (await res.json()) as ServerClapState;
      // Reduce the pending overlay by the delta we just committed.
      // Follow-up clicks that arrived mid-flight (tracked in
      // `pendingRef`) are still represented in `pendingDelta` and
      // stay visible until the drain POST below returns and
      // subtracts them in turn. The server's totals become the new
      // authoritative baseline in the same setState so the render
      // shows one consistent number, not committed(new) +
      // pending(old-not-yet-subtracted).
      setCommitted(body);
      setPendingDelta((p) => p - delta);
      setError(null);
    } catch (err) {
      // Revert the optimistic bump AND drop any queued follow-ups.
      // Silently re-firing while the user is reading "please try
      // again" would be dishonest.
      console.warn("[ClapButton] POST /claps failed", err);
      setPendingDelta((p) => p - delta - pendingRef.current);
      pendingRef.current = 0;
      setError("Couldn't save your clap — please try again.");
      inFlightRef.current = false;
      return;
    } finally {
      inFlightRef.current = false;
    }

    // Drain any deltas that arrived while we were in flight.
    if (pendingRef.current > 0) {
      const next = pendingRef.current;
      pendingRef.current = 0;
      void flushDelta(next);
    }
  }

  function onClick() {
    // Client-side cap check. The server cap is authoritative, but
    // stopping here saves a doomed POST and keeps the UX predictable
    // (button visibly refuses further clicks).
    if (displayedViewerCount >= MAX_CLAPS_PER_VIEWER) return;

    // Bump the optimistic overlay immediately — before any fetch
    // begins. The overlay reduces back when the corresponding POST
    // commits (see `flushDelta`).
    setPendingDelta((p) => p + 1);

    if (inFlightRef.current) {
      // Queue this click behind the in-flight POST — it'll drain as
      // part of that request's follow-up.
      pendingRef.current += 1;
      return;
    }
    void flushDelta(1);
  }

  const atCap = displayedViewerCount >= MAX_CLAPS_PER_VIEWER;
  const buttonLabel = `Clap for this article (${displayedViewerCount} / ${MAX_CLAPS_PER_VIEWER})`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClick}
          // Enabled even at the cap so tests can assert
          // click-is-a-no-op vs. click-does-nothing-because-disabled.
          // Visual affordance below makes the cap-hit state obvious.
          aria-label={buttonLabel}
          className={
            "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm " +
            (atCap
              ? "cursor-not-allowed border-neutral-300 bg-neutral-100 text-neutral-500"
              : "hover:bg-neutral-50")
          }
        >
          <span aria-hidden="true">♥</span>
          {displayedViewerCount === 0
            ? "Clap"
            : `Clapped (${displayedViewerCount})`}
        </button>
        <ClapCount count={displayedTotalCount} label="Total claps" />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
