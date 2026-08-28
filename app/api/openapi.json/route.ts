import { NextResponse } from "next/server";
import { assembleDocument } from "@/lib/openapi/document";

// Side-effect import: `lib/openapi/routes.ts` calls `registerRoute(...)` for
// every public endpoint at module scope. Without this import the registry
// stays empty (Next.js only evaluates a Route Handler on first hit, so we
// can't rely on the handlers themselves to populate the registry).
import "@/lib/openapi/routes";

/**
 * GET /api/openapi.json — see docs/specs/api-docs.md.
 *
 * The document is assembled per request rather than cached so `servers`
 * always reflects the host actually serving the response — critical for
 * Vercel preview URLs, where a pinned URL would send Scalar's "try it"
 * requests to the wrong deployment.
 */
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const doc = assembleDocument(origin);
  return NextResponse.json(doc);
}
