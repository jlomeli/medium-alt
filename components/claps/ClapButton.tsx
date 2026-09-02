"use client";

/**
 * `<ClapButton>` — the read-page clap affordance. See docs/specs/claps.md
 * § UI surface.
 *
 * Two variants, decided at render time by the parent:
 *   1. Signed-in + viewer is NOT the article's author — renders a
 *      `<button>` with `useOptimistic` semantics. Click bumps the
 *      count immediately (the whole reason this slice exists); the
 *      POST fires in the background. Multiple rapid clicks queue up
 *      as one `delta: N` batch behind a single in-flight request.
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
import { useOptimistic, useRef, useState, useTransition } from "react";
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
  // The optimistic layer above adds pending deltas on top for the
  // immediate visual response.
  const [committed, setCommitted] = useState<ServerClapState>({
    viewerCount: initialViewerCount,
    totalCount: initialTotalCount,
  });

  // `useOptimistic` seeds from `committed` and merges a pending delta
  // whenever the click handler updates. On revert (see catch below),
  // we throw the pending delta away by re-setting `committed` to
  // itself with `flushSync`-adjacent semantics — the optimistic hook
  // re-derives from the current committed state.
  const [optimistic, addOptimistic] = useOptimistic<
    ServerClapState,
    number
  >(committed, (state, delta) => ({
    viewerCount: Math.min(state.viewerCount + delta, MAX_CLAPS_PER_VIEWER),
    totalCount: state.totalCount + delta,
  }));

  const [, startTransition] = useTransition();
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

  async function flushDelta(delta: number) {
    // `startTransition` scopes both the optimistic mutation and the
    // subsequent server-state commit so React can prioritise other
    // renders. Without it, `useOptimistic` outside a transition
    // throws in strict mode.
    inFlightRef.current = true;
    let applied = delta;
    try {
      startTransition(() => {
        addOptimistic(delta);
      });
      const res = await fetch(`/api/articles/${encodeURIComponent(slug)}/claps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ delta }),
      });
      if (!res.ok) throw new Error(`POST /claps returned ${res.status}`);
      const body = (await res.json()) as ServerClapState;
      // Commit the server truth. The optimistic delta is discarded
      // in favour of the authoritative numbers — `useOptimistic`
      // re-seeds from `committed` on the next render.
      startTransition(() => {
        setCommitted(body);
        setError(null);
      });
    } catch (err) {
      // Revert the optimistic bump by reasserting the current
      // `committed` state and surfacing the error. The catch runs
      // OUTSIDE the transition — startTransition swallows thrown
      // promises silently, so the alert wouldn't render if we
      // resurfaced there.
      console.warn("[ClapButton] POST /claps failed", err);
      startTransition(() => {
        // Re-set committed to the same reference to trigger a re-
        // render; `useOptimistic` then derives from committed
        // without the pending delta.
        setCommitted((c) => ({ ...c }));
        setError("Couldn't save your clap — please try again.");
      });
      // On failure, drop any queued follow-ups too. Bailing on the
      // queue keeps the error alert honest: we're not silently
      // re-firing while the user is looking at "please try again".
      pendingRef.current = 0;
      applied = 0;
    } finally {
      inFlightRef.current = false;
    }

    // Drain any deltas that arrived while we were in flight.
    if (pendingRef.current > 0 && applied > 0) {
      const next = pendingRef.current;
      pendingRef.current = 0;
      // Fire and forget — the loop-detection is that pendingRef is
      // now zero, so any further clicks during THIS drain enqueue
      // there and hit the next iteration.
      void flushDelta(next);
    }
  }

  function onClick() {
    // Client-side cap check. The server cap is authoritative, but
    // stopping here saves a doomed POST and keeps the UX predictable
    // (button visibly refuses further clicks).
    if (optimistic.viewerCount >= MAX_CLAPS_PER_VIEWER) return;

    if (inFlightRef.current) {
      // Queue the click behind the in-flight POST — it'll drain as
      // part of the response's follow-up.
      pendingRef.current += 1;
      startTransition(() => {
        // Still show the optimistic bump so the count feels
        // immediate even while queued.
        addOptimistic(1);
      });
      return;
    }
    void flushDelta(1);
  }

  const atCap = optimistic.viewerCount >= MAX_CLAPS_PER_VIEWER;
  const buttonLabel = `Clap for this article (${optimistic.viewerCount} / ${MAX_CLAPS_PER_VIEWER})`;

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
          {optimistic.viewerCount === 0
            ? "Clap"
            : `Clapped (${optimistic.viewerCount})`}
        </button>
        <ClapCount count={optimistic.totalCount} label="Total claps" />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
