import type { APIRequestContext } from "@playwright/test";

/**
 * Clap factory — see docs/specs/claps.md § E2E test plan.
 *
 * Only `.create()` / `.delete()` — a clap detached from an article is
 * meaningless, so no `.build()` variant. The POST endpoint is
 * cap-idempotent (repeat POST → 200 with updated counts), so calling
 * `.create()` twice for the same pair does NOT throw.
 */
export class ClapFactory {
  /**
   * `readerApi` MUST already carry the reader's session cookie —
   * usually the `.request` off a `loggedInPage`'s context, or the
   * `.api` field returned by `createLoggedInApi` for a secondary
   * user. `slug` is the article being clapped. Optional `delta`
   * batches multiple claps into one request (1–50, capped
   * server-side).
   */
  async create(
    readerApi: APIRequestContext,
    slug: string,
    opts: { delta?: number } = {},
  ): Promise<{ viewerCount: number; totalCount: number }> {
    const res = await readerApi.post(
      `/api/articles/${encodeURIComponent(slug)}/claps`,
      { data: opts.delta !== undefined ? { delta: opts.delta } : {} },
    );
    if (!res.ok()) {
      throw new Error(
        `ClapFactory.create() failed: POST /api/articles/${slug}/claps ${res.status()} — ${await res.text()}`,
      );
    }
    return (await res.json()) as { viewerCount: number; totalCount: number };
  }

  async delete(readerApi: APIRequestContext, slug: string): Promise<void> {
    const res = await readerApi.delete(
      `/api/articles/${encodeURIComponent(slug)}/claps`,
    );
    // Clearing is idempotent — 204 whether or not a row existed.
    if (res.status() !== 204) {
      throw new Error(
        `ClapFactory.delete() failed: DELETE /api/articles/${slug}/claps ${res.status()} — ${await res.text()}`,
      );
    }
  }
}
