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

export interface RegisteredRoute {
  method: HttpMethod;
  path: string;
  summary: string;
  description?: string;
  tags?: string[];
  request?: ZodType;
  responses: Partial<Record<string, { description: string; schema: ZodType }>>;
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
