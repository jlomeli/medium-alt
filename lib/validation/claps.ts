/**
 * Zod schemas for the claps endpoint. See docs/specs/claps.md §
 * API surface.
 *
 * `AddClapsInput` — POST body. `delta` is optional; missing/empty
 * body parses as `{ delta: 1 }` (the natural per-click semantics).
 * A `delta` of 0, negative, non-integer, or > 50 is rejected at the
 * schema — the route surfaces it as
 * `{ error: { field: "delta", code: "out-of-range" } }`.
 */
import { z } from "zod";

/** Per-viewer clap ceiling. Also enforced by
 * `lib/claps/service.ts::addClaps`. Duplicated here so a malformed
 * client request is rejected before the DB is touched, and centralised
 * so a future change lands in one file. */
export const MAX_CLAPS_PER_VIEWER = 50;

export const addClapsSchema = z
  .object({
    delta: z
      .number()
      .int()
      .min(1)
      .max(MAX_CLAPS_PER_VIEWER)
      .optional(),
  })
  .strict();

export type AddClapsInput = z.infer<typeof addClapsSchema>;
