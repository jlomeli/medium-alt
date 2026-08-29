import { createDocument } from "zod-openapi";
import { listRoutes } from "./registry";
import pkg from "@/package.json";

/**
 * Assembles the final OpenAPI 3.1 document from the module-scoped
 * `registry.ts` entries. Called from `app/api/openapi.json/route.ts`.
 *
 * `servers` is derived from the request's origin so the same document
 * behaves correctly across dev / preview / prod without an env-var-pinned
 * URL (which was the trap that broke Auth.js redirects earlier — see
 * `lib/auth/config.ts` trustHost note).
 */
export function assembleDocument(originUrl: string) {
  const routes = listRoutes();

  return createDocument({
    openapi: "3.1.0",
    info: {
      title: "Medium-Alt API",
      version: pkg.version,
      description:
        "Auto-generated from the Zod schemas that also power server-side " +
        "validation. See docs/specs/api-docs.md.",
    },
    servers: [{ url: originUrl }],
    paths: routes.reduce<
      Record<string, Record<string, ReturnType<typeof buildOperation>>>
    >((acc, route) => {
      acc[route.path] ??= {};
      acc[route.path][route.method] = buildOperation(route);
      return acc;
    }, {}),
  });
}

function buildOperation(route: ReturnType<typeof listRoutes>[number]) {
  return {
    summary: route.summary,
    ...(route.description ? { description: route.description } : {}),
    ...(route.tags ? { tags: route.tags } : {}),
    ...(route.request
      ? {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: route.request,
              },
            },
          },
        }
      : {}),
    responses: Object.entries(route.responses).reduce<
      Record<
        string,
        {
          description: string;
          headers?: Record<string, { description?: string; schema?: unknown }>;
          content?: Record<string, { schema: unknown }>;
        }
      >
    >((acc, [code, r]) => {
      if (!r) return acc;
      // Only emit `content` when there IS a body schema. A response with
      // no body — e.g. a 303 whose contract is `Location` + `Set-Cookie`
      // headers — must NOT carry `content: { "application/json": ... }`,
      // or generated clients try to decode an empty payload and drop the
      // real redirect/cookie contract on the floor.
      acc[code] = {
        description: r.description,
        ...(r.headers ? { headers: r.headers } : {}),
        ...(r.schema ? { content: { "application/json": { schema: r.schema } } } : {}),
      };
      return acc;
    }, {}),
  };
}
