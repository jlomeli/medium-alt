import { ApiReference } from "@scalar/nextjs-api-reference";

/**
 * GET /api/docs — Scalar-rendered API reference.
 *
 * Scalar client-side-renders the reference from `/api/openapi.json`. The h1
 * shown on the page mirrors the document's `info.title`.
 */
export const GET = ApiReference({
  url: "/api/openapi.json",
});
