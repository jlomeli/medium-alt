/**
 * Pure-display clap count. Shared between `<ArticleCard>` (feed
 * surface) and `<ClapButton>` (read-page surface) so the "0 → dim
 * it? show a heart?" convention lives in one file.
 *
 * DOM shape:
 *   <span class="…">
 *     <span aria-hidden="true">♥</span>
 *     <span aria-label="<contextLabel>">42</span>
 *   </span>
 *
 * The count number lives in its own `<span aria-label=…>` so
 * `getByLabel(...).toHaveText("42")` in tests matches the digit
 * only, not the glyph. The glyph is inside a sibling with
 * `aria-hidden="true"` — decorative, not announced to screen
 * readers. The wrapper span has no accessible name; a screen reader
 * hears only the labeled child ("Clap count 42").
 *
 * The count is rendered as-is (no thousands separator) — the app
 * is a local demo and the numeric assertions in E2E tests are strict
 * `.toHaveText("42")` matches. If the count ever needs formatting,
 * do it in this file so the display stays uniform.
 */
export function ClapCount({
  count,
  label = "Clap count",
  className,
}: {
  count: number;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={
        className ?? "inline-flex items-center gap-1 text-sm text-neutral-600"
      }
    >
      <span aria-hidden="true">♥</span>
      <span aria-label={label}>{count}</span>
    </span>
  );
}
