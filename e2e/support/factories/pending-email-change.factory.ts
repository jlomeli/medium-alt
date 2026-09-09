import type { APIRequestContext } from "@playwright/test";
import { randomBytes } from "node:crypto";

/**
 * Pending-email-change factory. Mirrors the other factories:
 *   - `.build(overrides)` — a unique-by-default new-email attr, no DB.
 *   - `.create(api, overrides)` — POSTs to `/api/me/email` on the given
 *     already-authed `APIRequestContext` (typically
 *     `loggedInUser.page.request`). Returns the `newEmail` that was
 *     submitted so tests can pass it to Mailpit / the confirm route
 *     without having to snapshot the input.
 *
 * The raw token is NOT returned — it's not observable from the API
 * surface. Tests that need the token pull it out of Mailpit or, for
 * the "expire this row" seam, hand the raw token they extracted from
 * the verification email back to `/api/test/email-change/expire`.
 *
 * See docs/CODING_STANDARDS.md § Testing and
 * docs/specs/account-security.md § Testing seams.
 */
export type PendingEmailChangeAttrs = {
  newEmail: string;
};

function unique(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}

export class PendingEmailChangeFactory {
  build(overrides: Partial<PendingEmailChangeAttrs> = {}): PendingEmailChangeAttrs {
    return {
      newEmail: `${unique("new")}@example.test`,
      ...overrides,
    };
  }

  async create(
    api: APIRequestContext,
    overrides: Partial<PendingEmailChangeAttrs> = {},
  ): Promise<PendingEmailChangeAttrs> {
    const attrs = this.build(overrides);
    const res = await api.post("/api/me/email", {
      data: { newEmail: attrs.newEmail },
    });
    if (res.status() !== 202) {
      throw new Error(
        `PendingEmailChangeFactory.create() failed: POST /api/me/email ${res.status()} — ${await res.text()}`,
      );
    }
    return attrs;
  }
}
