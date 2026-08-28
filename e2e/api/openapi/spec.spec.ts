import { test, expect } from "@e2e/support/fixtures";
import { registerSchema } from "@/lib/validation/auth";

/**
 * Acceptance criteria from docs/specs/api-docs.md.
 *
 * All tests are currently RED — `/api/openapi.json` doesn't exist yet.
 */

/** Minimal typed view of what we assert on inside the document. */
interface OpenApiDoc {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<
    string,
    Record<
      string,
      {
        summary?: string;
        requestBody?: {
          content?: Record<string, { schema?: unknown }>;
        };
        responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
      }
    >
  >;
  components?: { schemas?: Record<string, unknown> };
}

async function fetchDoc(api: import("@playwright/test").APIRequestContext): Promise<{
  status: number;
  contentType: string;
  body: OpenApiDoc;
}> {
  const res = await api.get("/api/openapi.json");
  return {
    status: res.status(),
    contentType: res.headers()["content-type"] ?? "",
    body: (await res.json()) as OpenApiDoc,
  };
}

test.describe("@smoke @api openapi document", () => {
  test("GET /api/openapi.json returns valid OpenAPI 3.1 JSON", async ({ api }) => {
    const { status, contentType, body } = await fetchDoc(api);
    expect(status).toBe(200);
    expect(contentType).toContain("application/json");
    expect(body.openapi).toBe("3.1.0");
    expect(body.info.title).toBeTruthy();
    expect(body.info.version).toBeTruthy();
  });

  test("every custom endpoint appears with a summary + request + 2xx response schema", async ({
    api,
  }) => {
    const { body } = await fetchDoc(api);

    const required: Array<[string, string]> = [
      ["/api/register", "post"],
      ["/api/password-reset/request", "post"],
      ["/api/password-reset/confirm", "post"],
    ];

    for (const [path, method] of required) {
      const operation = body.paths[path]?.[method];
      expect(operation, `${method.toUpperCase()} ${path} missing from openapi.paths`).toBeDefined();
      expect(operation!.summary, `${method.toUpperCase()} ${path} missing summary`).toBeTruthy();
      expect(
        operation!.requestBody?.content?.["application/json"]?.schema,
        `${method.toUpperCase()} ${path} missing JSON request schema`,
      ).toBeDefined();
      const twoXx = Object.keys(operation!.responses ?? {}).find((code) => code.startsWith("2"));
      expect(twoXx, `${method.toUpperCase()} ${path} has no 2xx response`).toBeTruthy();
    }
  });

  test("excluded surfaces do not appear in the document", async ({ api }) => {
    const { body } = await fetchDoc(api);
    const paths = Object.keys(body.paths);
    for (const forbidden of [
      "/api/openapi.json",
      "/api/docs",
      "/api/logout",
      "/api/auth/csrf",
      "/api/auth/callback/credentials",
      "/api/test/password-reset/expire",
    ]) {
      expect(paths, `${forbidden} must not appear in openapi.paths`).not.toContain(forbidden);
    }
  });

  test("RegisterInput round-trips: doc's request schema accepts the same payloads Zod does", async ({
    api,
    userFactory,
  }) => {
    const { body } = await fetchDoc(api);
    const registerOp = body.paths["/api/register"]?.["post"];
    const docSchema = registerOp?.requestBody?.content?.["application/json"]?.schema as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(docSchema).toBeDefined();

    // The generator should expose the same required-fields set as the Zod
    // schema. Password can be top-level required in the doc; Zod also treats
    // it required. `name` is optional in both.
    expect(new Set(docSchema.required)).toEqual(new Set(["email", "username", "password"]));
    expect(Object.keys(docSchema.properties ?? {})).toEqual(
      expect.arrayContaining(["email", "username", "password", "name"]),
    );

    // Live cross-check: a valid factory payload is accepted by the Zod schema
    // that generated the doc.
    const attrs = userFactory.build();
    expect(registerSchema.safeParse(attrs).success).toBe(true);
  });
});
