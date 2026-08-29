import { test, expect } from "@e2e/support/fixtures";
import { registerSchema } from "@/lib/validation/auth";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import * as OpenApiParser from "@readme/openapi-parser";

/**
 * Acceptance criteria from docs/specs/api-docs.md.
 *
 * Two validators do the heavy lifting:
 *   - `@readme/openapi-parser` for the OpenAPI 3.1 document itself — it
 *     dereferences `$ref`s and validates against the 3.1 spec's JSON Schema.
 *   - Ajv (draft 2020-12, matching OpenAPI 3.1's schema dialect) for
 *     validating specific payloads against emitted request/response schemas.
 */

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
  test("GET /api/openapi.json returns a document that validates against the OpenAPI 3.1 spec", async ({
    api,
  }) => {
    const { status, contentType, body } = await fetchDoc(api);
    expect(status).toBe(200);
    expect(contentType).toContain("application/json");
    expect(body.openapi).toBe("3.1.0");

    // Structural validation. `validate` throws on any spec violation and
    // includes the offending path in the error message. Uses the OpenAPI
    // 3.1 JSON Schema internally; a mistranslation upstream (bad `type`,
    // missing `responses`, invalid `$ref`, etc.) fails here — no more
    // "green test on structurally broken doc" possible.
    // The parser mutates via dereferencing; pass a deep clone so the doc
    // returned by our endpoint is not depended on by later assertions.
    await expect(
      OpenApiParser.validate(JSON.parse(JSON.stringify(body))),
    ).resolves.toBeTruthy();
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

  test("bodyless responses (303 logout) advertise headers, not a JSON body", async ({ api }) => {
    // Pinning test: /api/logout returns an empty 303 whose contract is
    // Location + Set-Cookie. Advertising `content: application/json` here
    // would tell generated clients there's a body to decode and hide the
    // real redirect/cookie contract from strict tooling.
    const { body } = await fetchDoc(api);
    const op = body.paths["/api/logout"]?.["post"] as
      | { responses?: Record<string, unknown> }
      | undefined;
    expect(op, "POST /api/logout must be registered").toBeDefined();
    const response303 = op!.responses?.["303"] as
      | { content?: unknown; headers?: Record<string, unknown> }
      | undefined;
    expect(response303, "303 response must be present").toBeDefined();
    expect(response303!.content, "303 must not advertise a JSON body").toBeUndefined();
    expect(response303!.headers).toBeDefined();
    expect(Object.keys(response303!.headers!)).toEqual(
      expect.arrayContaining(["Location", "Set-Cookie"]),
    );
  });

  test("excluded surfaces do not appear in the document", async ({ api }) => {
    const { body } = await fetchDoc(api);
    const paths = Object.keys(body.paths);
    // `/api/logout` was previously here; as of the auth-api slice (#9) it
    // is intentionally documented, so it's dropped from this list. See
    // docs/specs/auth-api.md for the rationale.
    for (const forbidden of [
      "/api/openapi.json",
      "/api/docs",
      "/api/auth/csrf",
      "/api/auth/callback/credentials",
      "/api/test/password-reset/expire",
    ]) {
      expect(paths, `${forbidden} must not appear in openapi.paths`).not.toContain(forbidden);
    }
  });

  test("RegisterInput round-trips: emitted JSON Schema accepts what Zod accepts and rejects what Zod rejects", async ({
    api,
    userFactory,
  }) => {
    // Dereference the whole doc so any `$ref` inside `docSchema` (e.g. to
    // `#/components/schemas/...`) resolves to inline structure Ajv can
    // compile. Deep clone first — `dereference` mutates.
    const { body } = await fetchDoc(api);
    const doc = (await OpenApiParser.dereference(
      JSON.parse(JSON.stringify(body)) as OpenApiDoc,
    )) as OpenApiDoc;

    const docSchema = doc.paths["/api/register"]?.["post"]?.requestBody?.content?.[
      "application/json"
    ]?.schema as Record<string, unknown> | undefined;
    expect(docSchema).toBeDefined();

    // Ajv 2020 = JSON Schema draft 2020-12 = OpenAPI 3.1's schema dialect.
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    const validateDoc = ajv.compile(docSchema!);

    // POSITIVE — the emitted schema must accept a valid factory payload,
    // and Zod must accept it too. Anything else means drift between the
    // spec generator and the runtime validator.
    const good = userFactory.build();
    expect(registerSchema.safeParse(good).success, "Zod rejected valid factory input").toBe(true);
    expect(validateDoc(good), `emitted schema rejected valid input: ${ajv.errorsText(validateDoc.errors)}`)
      .toBe(true);

    // NEGATIVE — cases that violate each Zod constraint. Both validators
    // must reject the same inputs. If Zod says password must be ≥ 8 chars
    // with upper/lower/digit but the emitted JSON Schema only enforces
    // `minLength: 8`, the "short" case would slip through — this table
    // catches that drift.
    const negatives: Array<{ label: string; payload: Record<string, unknown> }> = [
      { label: "malformed email", payload: { ...good, email: "not-an-email" } },
      { label: "short password (< 8)", payload: { ...good, password: "aA1x" } },
      {
        label: "password missing digit",
        payload: { ...good, password: "NoDigitsHere" },
      },
      { label: "missing password", payload: { email: good.email, username: good.username } },
      { label: "too-short username", payload: { ...good, username: "ab" } },
    ];
    for (const { label, payload } of negatives) {
      const zodOk = registerSchema.safeParse(payload).success;
      const docOk = validateDoc(payload);
      expect(
        zodOk,
        `Zod ${zodOk ? "unexpectedly accepted" : "correctly rejected"} ${label}`,
      ).toBe(false);
      expect(
        docOk,
        `emitted schema ${docOk ? "unexpectedly accepted" : "correctly rejected"} ${label} — ` +
          `Zod-to-OpenAPI drift for this constraint`,
      ).toBe(false);
    }
  });
});
