import type { APIRequestContext } from "@playwright/test";

/**
 * Follow factory — see docs/specs/follow.md § E2E test plan.
 *
 * Only a `.create()` — a follow with no target is meaningless, so no
 * `.build()` variant. The API is idempotent (repeat POST → 200 with
 * same body), so calling `.create()` twice for the same pair does
 * NOT throw.
 */
export class FollowFactory {
  /**
   * `followerApi` MUST already carry the follower's session cookie —
   * usually the `.request` off a `loggedInPage`'s context, or the
   * `.api` field returned by `createLoggedInApi` for a secondary
   * user. `targetUsername` is the username of the person being
   * followed.
   */
  async create(
    followerApi: APIRequestContext,
    targetUsername: string,
  ): Promise<void> {
    const res = await followerApi.post(
      `/api/users/${encodeURIComponent(targetUsername)}/follow`,
    );
    if (!res.ok()) {
      throw new Error(
        `FollowFactory.create() failed: POST /api/users/${targetUsername}/follow ${res.status()} — ${await res.text()}`,
      );
    }
  }

  async delete(
    followerApi: APIRequestContext,
    targetUsername: string,
  ): Promise<void> {
    const res = await followerApi.delete(
      `/api/users/${encodeURIComponent(targetUsername)}/follow`,
    );
    // Unfollow is idempotent — 204 whether or not a row existed.
    // 404 (unknown target) is still an error; surface it loudly.
    if (res.status() !== 204) {
      throw new Error(
        `FollowFactory.delete() failed: DELETE /api/users/${targetUsername}/follow ${res.status()} — ${await res.text()}`,
      );
    }
  }
}
