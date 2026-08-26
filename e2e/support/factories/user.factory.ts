import type { APIRequestContext } from "@playwright/test";
import { randomBytes } from "node:crypto";

/**
 * User factory — the first of what will be a small family of factories
 * (Article, Comment, Tag). Modeled on Rails' factory_bot and the TS fishery
 * library.
 *
 * Pattern:
 *   - `.build()` returns a valid, unique-by-default in-memory user (no DB hit).
 *   - `.create()` materializes it via the app's /api/register endpoint.
 *   - `.createDirect()` will write straight through Prisma (fast path for
 *     bulk seeding — added when the auth feature lands and we know the
 *     password-hash shape).
 *
 * See docs/CODING_STANDARDS.md §Testing for the full policy.
 */

export type UserAttrs = {
  email: string;
  username: string;
  password: string;
  name?: string;
};

export type CreatedUser = UserAttrs & {
  id: string;
};

function unique(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}

export class UserFactory {
  constructor(private readonly api: APIRequestContext) {}

  build(overrides: Partial<UserAttrs> = {}): UserAttrs {
    const slug = unique("u");
    return {
      email: `${slug}@example.test`,
      username: slug,
      password: "P@ssw0rd-test-123",
      name: `Test User ${slug}`,
      ...overrides,
    };
  }

  async create(overrides: Partial<UserAttrs> = {}): Promise<CreatedUser> {
    // TODO(auth-feature): swap this stub for a real POST /api/register call
    // once the register endpoint exists. See docs/specs/auth.md.
    const _attrs = this.build(overrides);
    throw new Error(
      "UserFactory.create() not yet wired — /api/register does not exist. " +
        "See docs/specs/auth.md.",
    );
  }
}
