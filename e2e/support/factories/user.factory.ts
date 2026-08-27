import type { APIRequestContext } from "@playwright/test";
import { randomBytes } from "node:crypto";

/**
 * User factory — first of a small family (Article, Comment, Tag will follow).
 * Modeled on factory_bot / fishery.
 *
 *   - `.build()` — valid unique-by-default in-memory attrs (no DB hit).
 *   - `.create()` — persists via `POST /api/register` and returns the created user.
 *
 * See docs/CODING_STANDARDS.md §Testing.
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
    const attrs = this.build(overrides);
    const res = await this.api.post("/api/register", { data: attrs });
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(
        `UserFactory.create() failed: POST /api/register ${res.status()} — ${body}`,
      );
    }
    const json = (await res.json()) as { user: { id: string } };
    return { ...attrs, id: json.user.id };
  }
}
