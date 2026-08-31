# Spec: Articles rich-text editor (slice 4b of 4)

Tracking: TBD
Status: draft
Owner: jlomeli

## Position in the roadmap

Deferred half of step 4 ([articles-crud.md](./articles-crud.md) §
"Position in the roadmap"):

- **4a — shipped.** Article model + CRUD + drafts/published; body was a
  plain textarea.
- **4b — this spec.** Replace the plain textarea with a Tiptap editor;
  migrate `Article.body` from `String` → `Json`; teach the read view to
  render Tiptap output server-side. No images.
- **4c — later.** UploadThing wiring: cover-image field on Article,
  inline image node in the Tiptap toolbar.

Scoped ruthlessly to 4b. Anything image-shaped stays in 4c.

## Intent

4a shipped the CRUD scaffolding on a textarea so the review could focus
on data shape, ownership, and anti-enumeration — not on rich text. This
slice earns the "Medium clone" name: authors compose in a real WYSIWYG
surface with formatting they'd expect (headings, bold, italic, lists,
blockquote, code, links), and readers see rendered output — not raw
markdown or a `<pre>` block. It also unblocks 4c (images live inside
the same editor) and sets the pattern the framework will need for every
future contenteditable-shaped surface (comments, bio, etc.).

## User stories

- As an author, I want a WYSIWYG editor with a visible toolbar so I can
  format prose without learning markdown.
- As an author, I want keyboard shortcuts (⌘B, ⌘I, ⌘K for link) so I
  can format without leaving the keyboard.
- As an author editing an existing article, I want the editor to open
  pre-loaded with the current formatting — bold stays bold, headings
  stay headings.
- As a reader, I want the published article to render with the same
  formatting the author saw, not a raw JSON dump or an unstyled block.
- As a maintainer, I want the rendered HTML to be safe by construction
  — a malicious author cannot smuggle `<script>`, event handlers, or
  `javascript:` links into the read view.

## Acceptance criteria

Each becomes one Playwright test. Grouped by journey.

### Editor UI

- [ ] `/articles/new` and `/articles/[slug]/edit` render a
  `role="toolbar"` with buttons labelled Bold, Italic, Heading 2,
  Heading 3, Bullet list, Numbered list, Blockquote, Code block, Link,
  Undo, Redo. All discoverable via `getByRole('button', { name: ... })`.
- [ ] The body surface exposes `role="textbox"` with an accessible name
  ("Body") so `getByRole('textbox', { name: 'Body' })` reaches it —
  the field-locator escape hatch (`data-testid`) is not needed.
- [ ] Clicking Bold with a selection wraps the selection in `<strong>`
  in the rendered read view; the toolbar button reports
  `aria-pressed="true"` while the caret is inside a bold run.
- [ ] Typing `⌘B` (or `Ctrl+B` on non-mac) toggles bold on the current
  selection — parity with the toolbar.
- [ ] Clicking Link opens an inline prompt for the URL; submitting sets
  a link mark on the selection; the resulting anchor renders with
  `rel="noopener noreferrer"` and (for external targets) `target="_blank"`.
- [ ] Undo (⌘Z) rewinds the last edit; Redo (⌘⇧Z) replays it.

### Read view

- [ ] A published article authored with bold, italic, an H2, an
  ordered list, a bullet list, a blockquote, a code block, and a link
  renders all of them in `/articles/{slug}` — each assertable via
  `getByRole('heading', { level: 2, name: ... })`, `getByRole('list')`,
  `getByRole('link', { name: ... })`, `text=...`.
- [ ] The link's `href` matches the value the author entered; `rel`
  contains `noopener noreferrer`.
- [ ] A `javascript:` URL entered in the link prompt is either rejected
  in the editor OR stripped at render time — the rendered anchor
  never has `href^="javascript:"`. Test asserts absence.
- [ ] Article body containing a hostile string
  (`<script>alert(1)</script>` typed as literal text) renders as
  visible text — never as an executing script node.
- [ ] Empty paragraphs at the end of a document don't render as
  visually-empty gaps larger than the base line-height (soft rule;
  covered by a snapshot-free `count()` assertion on `<p>` children).

### API contract

- [ ] `POST /api/articles` — accepts `body: TiptapDoc` (JSON object).
  Rejects `body: string` with a 400 field-scoped error keyed to `body`.
- [ ] `PATCH /api/articles/{slug}` — same contract on `body`.
- [ ] `GET /api/articles/{slug}` — response includes
  `body: TiptapDoc` (JSON object), not a string. `ArticleView` shape
  documented in OpenAPI reflects the change.
- [ ] Body larger than the configured serialized-JSON cap
  (see § Validation) returns a 400 keyed to `body`. The cap is
  documented and enforced on the same schema import used by the client.
- [ ] Body with an unknown node type or an unknown mark is rejected
  with a 400 (server-side allowlist mirrors the extension list).

### Data migration

- [ ] `pnpm db:migrate` on a database with existing articles converts
  each row's plain-text body to a Tiptap document without data loss —
  paragraphs are split on runs of ≥1 blank line; single newlines
  become soft breaks; the rendered read view of a migrated article
  matches the pre-migration visual content.
- [ ] After migration, the `Article.body` column is `Json` (NOT NULL);
  no `String` column named `body` remains.

### OpenAPI coverage

- [ ] `ArticleView` in `/api/openapi.json` reports `body` as an object
  (not a string). All five article endpoints stay registered; the
  coverage guard remains green.

## Non-goals

- **Images.** Cover-image field and inline image upload are 4c. The
  toolbar does not include an Image button in 4b — adding it later is
  a straightforward Tiptap extension registration.
- **Tables.** Not part of the substrate; skip the Tiptap table
  extensions and their bundle cost.
- **Code syntax highlighting.** Code blocks render as `<pre><code>`
  with the raw text; no lowlight/highlight.js dependency.
- **Collaborative editing.** No y-js, no realtime sync. Single writer
  per document; last-write-wins remains the model from 4a.
- **Draft autosave.** Save is still explicit via the button. Autosave
  would need its own spec (debounce, conflict handling, unsaved-changes
  guard) and is not on the roadmap.
- **Mentions / hashtags / emoji picker.** No.
- **Markdown import/export.** No.
- **Custom node types beyond StarterKit + Link.** Adds surface area
  we haven't earned yet.
- **Rich-text search.** Full-text search is not on the roadmap; the
  Tiptap JSON is not indexed for query at the DB layer.

## Data model delta

`Article.body` changes type from `String` (NOT NULL) to `Json` (NOT
NULL). No new columns.

```prisma
model Article {
  // ...unchanged...
  body Json      // Tiptap ProseMirror document. Shape validated by Zod on write.
  // ...unchanged...
}
```

### Migration

One migration named `articles-body-to-json`. Because Prisma can't
in-place change a column type across an incompatible representation,
the migration is authored by hand (Prisma will scaffold a shell; we
replace the body):

```sql
-- 1. Add the new column (nullable during the fill step).
ALTER TABLE "Article" ADD COLUMN "body_json" JSONB;

-- 2. Convert each row's plain-text body to a Tiptap doc.
--    Splitting rule: paragraphs on runs of ≥1 blank line.
--    Single newlines inside a paragraph become hard breaks.
UPDATE "Article" a
SET "body_json" = jsonb_build_object(
  'type', 'doc',
  'content', COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'type', 'paragraph',
          'content', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', para)
          )
        )
      )
      FROM regexp_split_to_table(a."body", E'\n{2,}') AS para
      WHERE length(para) > 0
    ),
    jsonb_build_array(
      jsonb_build_object('type', 'paragraph')
    )
  )
);

-- 3. Enforce NOT NULL, drop the old column, rename.
ALTER TABLE "Article" ALTER COLUMN "body_json" SET NOT NULL;
ALTER TABLE "Article" DROP COLUMN "body";
ALTER TABLE "Article" RENAME COLUMN "body_json" TO "body";
```

The soft-break-per-single-newline nuance is deliberately dropped in
SQL — the substrate has a handful of test articles authored in a
textarea, and paragraph-per-blank-line preserves the visible structure.
No user data is at stake.

The migration is idempotent on a fresh DB (a `pnpm db:reset` +
`pnpm db:migrate` produces the same schema either way).

## Validation

Zod schema for the Tiptap document, colocated with the existing
schemas in `lib/validation/article.ts`:

- `tiptapNodeSchema`: recursive `z.object({ type: z.string(), attrs?,
  content? })` where `type` is constrained to the allowlist below and
  every leaf's mark list is likewise allowlisted.
- Allowed node types: `doc`, `paragraph`, `heading` (attrs.level ∈ {2,
  3}), `bulletList`, `orderedList`, `listItem`, `blockquote`,
  `codeBlock`, `hardBreak`, `text`.
- Allowed marks on `text`: `bold`, `italic`, `code`, `link` (attrs.href
  matches `/^(https?:|mailto:|\/|#)/` — no `javascript:`, no `data:`,
  no relative-without-slash oddities).
- `bodySchema` replaces the plaintext version:
  `tiptapDocSchema.refine((doc) => serializedByteLength(doc) <= 40_000)`.
  40k JSON bytes is roughly a 15–20k-char article after node overhead;
  chosen empirically against a doc of paragraphs + light formatting
  to keep the effective content ceiling in the same order of magnitude
  as 4a's `20_000` char cap. If this proves too tight we can widen it
  in a follow-up.

The schema is the single source of truth: server route handlers
validate on the way in, the client re-validates before POST, OpenAPI
generates its request schema from the same import.

## Rendering

Server-side render via `@tiptap/html`'s `generateHTML(doc, extensions)`
inside the `/articles/[slug]` route handler / RSC. The extension list
is exported from `lib/articles/tiptap-extensions.ts` and imported by
both the editor and the renderer — one list, no drift.

Because the Zod schema already constrains node and mark types to the
allowlist, the generated HTML cannot contain a `<script>` node, event
handler attribute, or non-safe-scheme link. No DOMPurify pass is
added — validation-by-construction is preferred over post-hoc
scrubbing (fewer moving parts, no runtime dep). If a future extension
introduces unsafe attributes, the fix is at the extension boundary,
not at a render-time sanitizer.

Link marks get `rel="noopener noreferrer"` unconditionally and
`target="_blank"` when the href is absolute + external
(`new URL(href).origin !== siteOrigin`). Implemented as a Tiptap Link
extension option, not a post-render string replace.

## UI surface

- `<ArticleEditor>` — new "use client" component under
  `components/articles/`. Renders the toolbar + Tiptap `EditorContent`.
  Replaces the `<textarea>` inside `<ArticleForm>` (form container,
  labels, submit button, delete button, submitting/deleting locks all
  stay).
- `<ArticleView>` — 4a's component; body renderer swaps from `<pre
  className="whitespace-pre-wrap">` to a `dangerouslySetInnerHTML`
  containing the output of the shared `renderTiptap()` helper.
  Wrapping element gets `className="prose"` (Tailwind Typography
  plugin) for baseline typography.
- Toolbar uses `<button type="button" aria-pressed={active}
  aria-label="...">` — no `role="button"` on divs, no icon-only buttons
  without an accessible name.
- Empty-state placeholder text ("Tell your story…") via the Tiptap
  Placeholder extension; not asserted in tests but present for
  parity with product expectations.

New dep additions:
- `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`,
  `@tiptap/extension-link`, `@tiptap/extension-placeholder`,
  `@tiptap/html`.
- `@tailwindcss/typography` for `.prose` styles.

## Testing seams

None new. The editor exposes accessible affordances; tests reach it
via `getByRole('textbox', { name: 'Body' })` and the toolbar buttons.
Playwright's `Keyboard.press('Meta+B')` (or `Control+B` on non-mac,
selected via `process.platform`) covers the shortcut path.

## E2E test plan

- `e2e/tests/articles/editor.spec.ts` — new. Toolbar visibility,
  bold-via-button, bold-via-shortcut + `aria-pressed`, link prompt +
  rendered `rel`, undo/redo. `@regression`
- `e2e/tests/articles/read.spec.ts` — extended. Existing tests keep
  their intent; add cases asserting rendered `<strong>`, `<h2>`,
  `<ul>/<ol>/<li>`, `<blockquote>`, `<pre><code>`, `<a href>` for an
  article authored with each formatting. `@smoke` for a single
  "renders formatting" test; the rest `@regression`.
- `e2e/tests/articles/xss.spec.ts` — new. Literal `<script>` typed
  into the editor renders as text; `javascript:` URL rejected /
  stripped. `@regression`
- `e2e/api/articles/crud.spec.ts` — extended. POST/PATCH with
  Tiptap-shaped body succeeds; POST with `body: "string"` returns 400;
  POST with an unknown node type returns 400; GET returns `body` as
  object. `@smoke @api`
- `e2e/api/articles/migration.spec.ts` — optional; only if we choose
  to assert the migration idempotency at the API level rather than
  the DB level. Likely dropped in favour of a Vitest unit test on
  the plain-text-→-Tiptap conversion helper (if one is factored out
  of the SQL for reuse in tests).

Existing article specs updated only where the plain-text `body`
assertion breaks — e.g. edit spec's `bodyField.fill(...)` becomes
`await editor.type(...)` via the POM.

`ArticleFormPage` POM grows:
- `bodyEditor` locator → `getByRole('textbox', { name: 'Body' })`.
- `toolbar` locator → `getByRole('toolbar')` plus child button
  accessors.
- `.typeBody(text)` / `.applyBold()` / `.applyLink(url)` helpers.

`articleFactory.create(...)` accepts either a plain string (autobody
via helper) or a Tiptap doc; default fixture uses a small doc with a
paragraph + bold run so downstream tests get realistic-shaped data
for free.

## Open questions

None — decisions locked in below.

## Decisions

1. **Existing-data preservation.** Preserved via the raw-SQL block in
   § Migration. Zero data loss; migration is idempotent on a fresh DB.
2. **Sanitization strategy.** Validation-by-construction via the Zod
   allowlist (node/mark types + link schemes). No DOMPurify pass —
   `generateHTML` cannot emit unsafe markup from an allowlisted doc,
   so safety lives at one boundary (the schema) instead of two that
   can drift.
3. **API shape flip on `body`.** Public `body` in `ArticleView` goes
   from `string` to `object` with no bridge period. No external
   consumers, no versioned API surface, no client SDK — documented in
   the OpenAPI diff and considered acceptable.
