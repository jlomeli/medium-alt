import type { ZodType } from "zod";

/**
 * Single module-scoped registry that every Route Handler contributes to.
 *
 * We store the raw pieces (method, path, summary, request Zod schema, keyed
 * response Zod schemas) rather than materialised OpenAPI operation objects.
 * The final document is assembled once per boot in `lib/openapi/document.ts`
 * — see `assembleDocument()`. Keeping the registry declarative also keeps
 * every route's registration flat and diff-friendly.
 */

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export interface ResponseHeaderSpec {
  description?: string;
  schema?: { type: "string" | "integer" | "number" | "boolean" };
}

export interface RegisteredResponse {
  description: string;
  /** Omit for empty-body responses (e.g. a 303 whose contract is headers only). */
  schema?: ZodType;
  /** Response headers to document — Location, Set-Cookie, ETag, etc. */
  headers?: Record<string, ResponseHeaderSpec>;
}

export interface RegisteredRoute {
  method: HttpMethod;
  path: string;
  summary: string;
  description?: string;
  tags?: string[];
  request?: ZodType;
  responses: Partial<Record<string, RegisteredResponse>>;
}

const routes: RegisteredRoute[] = [];

export function registerRoute(route: RegisteredRoute): void {
  // Registration is expected to be idempotent — Route Handler modules can
  // be re-evaluated by Next during dev HMR, so deduplicate by method+path
  // rather than throwing on repeat calls.
  const key = `${route.method.toLowerCase()} ${route.path}`;
  const idx = routes.findIndex((r) => `${r.method.toLowerCase()} ${r.path}` === key);
  if (idx >= 0) routes[idx] = route;
  else routes.push(route);
}

export function listRoutes(): readonly RegisteredRoute[] {
  return routes;
}
