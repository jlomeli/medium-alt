# Spec: Articles images (slice 4c of 4)

Tracking: #14
Status: draft
Owner: jlomeli

## Position in the roadmap

Final slice of step 4 ([articles-crud.md](./articles-crud.md) §
"Position in the roadmap"):

- **4a — shipped.** Article model + CRUD + drafts/published; body was a
  plain textarea.
- **4b — shipped.** Tiptap editor + safe SSR renderer; body migrated to
  Json. No images.
- **4c — this spec.** Cover image on `Article`; inline `image` node in
  the Tiptap toolbar; UploadThing wired as the storage backend; alt
  text required on inline images.

Scoped ruthlessly to 4c. Anything past cover + inline uploads — image
resizing pipelines, video, embeds, galleries — is out.

## Intent

4b earned the "Medium clone" name on prose. This slice earns it on
imagery: every article can carry a cover image that shows on the read
view (and, in a later slice, on cards / feeds), and authors can drop
images into the body via the same toolbar-and-textbox surface. It also
lands the pattern the rest of the substrate needs for user-uploaded
binaries (avatars, comment attachments) — a single `<UploadButton>`
call site, a single Zod-validated route, one auth boundary. UploadThing
is picked deliberately over rolling S3 directly: the SDK ships the
signed-upload dance and a React button that already meets the locator
policy (`getByRole('button', { name: 'Add image' })`), so this slice
stays about images-as-a-domain, not about pre-signed URL plumbing.

## User stories

- As an author, I want to attach a cover image to my article so readers
  see a hero at the top of the read view.
- As an author, I want to drop an image into the body from the toolbar
  so I can illustrate a paragraph without leaving the composer.
- As an author, I want the editor to prompt me for alt text on every
  inline image so screen-reader readers get a description.
- As an author, I want a clear error when an upload is rejected (too
  large, wrong type) instead of a silent failure.
- As a reader, I want inline images to render at the same width as the
  prose column and cover images to render above the title, both with
  the alt text the author supplied.
- As a maintainer, I want the upload endpoint gated on the same session
  as the rest of the write surface — no anonymous uploads, no
  cross-author writes.

## Acceptance criteria

Each becomes one Playwright test. Grouped by journey.

### Cover image

- [ ] `/articles/new` and `/articles/[slug]/edit` render a "Cover image"
  affordance discoverable via `getByRole('button', { name: /cover
  image/i })`. Uploading an image via the button attaches it to the
  form state and shows a preview via `getByRole('img', { name: /cover/i
  })`.
- [ ] Submitting the form with a cover image persists
  `Article.coverImageUrl` and `Article.coverImageAlt`; the response
  from `GET /api/articles/{slug}` includes both.
- [ ] The read view (`/articles/{slug}`) renders a hero `<img>` above
  the title when `coverImageUrl` is present, addressable via
  `getByRole('img', { name: /* the coverImageAlt */ })`. Absent when
  `coverImageUrl` is null.
- [ ] Removing the cover image via a "Remove cover image" button clears
  both fields on the next save; the hero disappears on re-read.

### Inline images

- [ ] The editor toolbar renders an "Add image" button
  (`getByRole('button', { name: 'Add image' })`). Clicking it opens
  UploadThing's `<UploadButton>` UI (still `role="button"`-discoverable
  via its label).
- [ ] After a successful upload, the editor prompts for alt text
  (`role="dialog"` with a labelled "Alt text" input); confirming
  inserts an `image` node at the caret position with `src` set to the
  uploaded URL and `alt` set to the entered text.
- [ ] The confirm button on the alt-text dialog is disabled while the
  alt text is empty — screen-reader users are never handed an image
  with no description.
- [ ] The read view renders the image via `getByRole('img', { name:
  '<alt>' })` inside the article body region.
- [ ] Zod rejects a Tiptap doc that contains an image node with an
  empty `alt`, a missing `src`, or a `src` outside the configured
  UploadThing host allowlist. 400 keyed to `body`.

### Upload endpoint

- [ ] `POST /api/uploadthing` (the SDK's auto-mounted route) rejects
  unauthenticated requests with the SDK's standard 401 shape. Verified
  by an API-level spec — no browser session, no upload token.
- [ ] Uploading a file over the 5 MB cap surfaces a client-visible
  error message (asserted via `role="alert"` text match), and no
  network request lands the file. The cap is documented and enforced
  in the router config, not just client-side.
- [ ] Uploading a file whose MIME is outside the allowlist
  (`image/jpeg`, `image/png`, `image/webp`, `image/gif`) surfaces the
  same alert-shaped error and lands nothing.

### Delete-cascade

- [ ] `DELETE /api/articles/{slug}` removes the row AND fires
  best-effort deletion for every UploadThing file the article owned:
  its `coverImageUrl` (if any), plus every `image.attrs.src` in the
  Tiptap body. Verified via the E2E stub: the recorded upload files
  under `test-results/uploads/<key>` are gone after the delete
  resolves.
- [ ] Delete-cascade is best-effort: if the UploadThing SDK's
  `deleteFiles` call rejects (network flake, upstream 5xx), the DELETE
  still returns 204 and the failure is logged with the row id + the
  keys that were meant to be dropped. The DB row is the source of
  truth; a stray file in the bucket is a follow-up prune concern, not
  a request failure.
- [ ] On a rejected storage delete, the matching `Upload` rows are
  **kept**, not dropped. The row is the only durable ownership
  pointer for the still-present file — losing it would strand the
  file with no way for a reconciliation / retry job to find its
  owner. Verified by the failure-cascade API test asserting the file
  survives on disk after a 204.
- [ ] Delete-cascade is scoped by upload ownership: an author who
  copies another user's public UploadThing URL into their own article
  and then deletes it does NOT nuke the original file. Only keys the
  deleter uploaded (recorded in the `Upload` table on POST
  `/api/uploadthing`) reach `storage.deleteFiles`. Verified by an API
  test: user A uploads + attaches to A1; user B copies the URL into
  B1; B deletes B1; A's file is still on disk.
- [ ] Delete-cascade also skips keys still referenced by any of the
  deleter's OTHER articles (same cover URL, or the same URL as an
  inline body image). Without this, deleting one of two articles that
  share the same cover would remove the file and break the survivor.
  Verified by an API test: author uploads once, sets the URL as cover
  on articles X and Y, deletes X; the file (and its `Upload` row)
  survive because Y still references it.
### Known limitations

- **Race between reference walk and storage delete.** The cascade
  walks the deleter's remaining articles for references, then calls
  `storage.deleteFiles`. A concurrent POST/PATCH that saves a new
  article referencing one of the doomed keys between those two steps
  is missed, and the file is deleted from under it. The window is
  milliseconds but real. A correct fix requires two coordinated
  changes not in scope for this slice:
    1. Cascade + article writes serialize on a per-owner
       `pg_advisory_xact_lock(hashtext(ownerId))`.
    2. Article POST/PATCH validate at write time that every derived
       key still has an `Upload` row (Read Committed alone doesn't
       block concurrent Article INSERTs, so an advisory lock without
       write-time key validation only shrinks the window — a POST
       landing after the lock releases still succeeds against a dead
       key).
  Tracked for a follow-up slice; the current code notes the race
  where the walk happens.

- [ ] Delete-cascade does **not** protect cross-author hotlinks:
  the "sibling reference" check is intentionally per-author. If B
  pastes A's public URL into their own article and A then deletes,
  A's file is removed and B's reference breaks — same as any hotlink
  on the web. Making this cross-author would let any user permanently
  pin any other user's uploads by referencing them (a resource-lock
  attack, and a block on legitimate deletes: accidental upload,
  moderation, takedown request). The referring author's remedy is to
  upload their own copy so they own a stable reference; the platform's
  remedy is a future auto-copy-on-paste UX, not a cascade change.

### API contract

- [ ] `POST /api/articles` accepts optional `coverImageUrl` (URL string
  matching the UploadThing host allowlist) and optional `coverImageAlt`
  (≤ 200 chars). Both nullable; setting one without the other is
  allowed only for alt (a cover-less alt is inert).
- [ ] `PATCH /api/articles/{slug}` accepts the same two fields. Passing
  `coverImageUrl: null` clears both on the row.
- [ ] `GET /api/articles/{slug}` returns `coverImageUrl` and
  `coverImageAlt` in `ArticleView`. Both are `string | null`. Never
  leaks the raw UploadThing file key or user id.
- [ ] `POST /api/articles` with `body` containing an image node
  succeeds when the node's `src` is a UploadThing URL; the same body
  with `src` on an off-host origin returns 400.

### OpenAPI coverage

- [ ] `ArticleView`, `CreateArticleInput`, `UpdateArticleInput` all
  advertise the new fields. The `/api/uploadthing` route is documented
  as a stub (method + auth requirement + response codes), pointing at
  the SDK for the payload shape.
- [ ] Coverage guard remains green — every registered route has a spec
  entry.

## Non-goals

- **Server-side image processing.** No sharp, no re-encode, no EXIF
  strip, no thumbnail derivatives. UploadThing serves the original.
  Documented so a future slice can add it without re-litigating.
- **Image galleries / multi-image blocks.** One image per inline node.
  A `figure` + `figcaption` extension is deferred.
- **Drag-and-drop uploads.** The button is the only entry point. Paste
  and drop paths would need their own upload dispatch + alt-text
  choreography; deferred to keep this slice reviewable.
- **Client-side crop / rotate UI.** Not shipped.
- **Alt-text on cover images being required.** Optional, unlike
  inline. Cover is a hero more than a content element; forcing alt
  before every save is a form-friction cost we don't want on the
  primary create path. The read view sets `alt=""` (decorative) when
  the author left it blank.
- **UploadThing file management UI.** No list-my-uploads screen, no
  delete-from-my-uploads. (Delete-cascade of an article's own uploads
  IS in scope for this slice — see § API surface and Decision 6.)
- **Rate limiting on uploads.** Auth is the gate; per-user quotas are
  a later concern. UploadThing's default upstream limits apply.
- **Video / audio / arbitrary binary.** MIME allowlist is images only.
- **Optimistic UI.** Uploads block on the SDK's completion callback;
  the form doesn't fake a preview until the URL is real.

## Data model delta

Two nullable columns on `Article`. No new tables.

```prisma
model Article {
  // ...unchanged...
  coverImageUrl String?  // UploadThing URL; null when no cover set.
  coverImageAlt String?  // Optional dek for the cover. Null → decorative alt="".
  // ...unchanged...
}
```

### Migration

One migration named `articles-cover-image`. Prisma will scaffold it as
a straight `ALTER TABLE`:

```sql
ALTER TABLE "Article" ADD COLUMN "coverImageUrl" TEXT;
ALTER TABLE "Article" ADD COLUMN "coverImageAlt" TEXT;
```

Nullable both; no backfill. Existing articles have no cover.

## Validation

New pieces in `lib/validation/article.ts`:

- `UPLOADTHING_HOST_RE` — regex matching allowed hosts. Sourced from
  `env.UPLOADTHING_URL_PREFIX` at module load; hard-coded to
  `https://utfs.io/` and `https://<app>.ufs.sh/` by default (both are
  official UploadThing origins). The test env overrides via
  `E2E_UPLOADTHING_HOST_ALLOWLIST` when tests stub the CDN.
- `uploadedImageUrlSchema = z.string().url().refine(u =>
  UPLOADTHING_HOST_RE.test(u), 'Image URL must be on the upload host')`.
- `coverImageAltSchema = z.string().max(200).optional()`.
- Tiptap node schema gains an `image` entry with strict attrs:
  `{ src: uploadedImageUrlSchema, alt: z.string().min(1).max(200),
  title?: z.string().max(200) }`. `alt.min(1)` is the schema-side
  enforcement of the "no unlabeled inline images" rule.
- `bodySchema` reuses the tightened node schema; its 40k byte cap from
  4b stays.

The URL allowlist is the security fence: without it, an author could
POST a Tiptap doc whose image `src` is any URL — including a
tracker pixel or a spoofed origin. Restricting to the CDN we own the
auth flow into keeps the `<img>` load path on trust boundaries we
control.

## API surface

| Method | Path                     | Auth | Input (Zod)                                          | Output                              |
| ------ | ------------------------ | ---- | ---------------------------------------------------- | ----------------------------------- |
| POST   | `/api/uploadthing`       | Yes  | UploadThing SDK internals (multipart)                | `{ url, key, name, size, type }[]`  |
| GET    | `/api/uploadthing`       | Yes  | SDK internals (route metadata)                       | SDK-defined                         |
| POST   | `/api/articles`          | Yes  | `CreateArticleInput` + `coverImageUrl?`, `coverImageAlt?` | `ArticleView` (with cover fields)   |
| PATCH  | `/api/articles/{slug}`   | Yes  | `UpdateArticleInput` + `coverImageUrl?`, `coverImageAlt?` | `ArticleView` (with cover fields)   |
| GET    | `/api/articles/{slug}`   | -    | -                                                    | `ArticleView` (includes cover)      |
| DELETE | `/api/articles/{slug}`   | Yes  | -                                                    | 204 (cascades UploadThing deletes)  |

`POST /api/uploadthing` is auto-mounted by the SDK. Our
`app/api/uploadthing/route.ts` file wires the SDK's `createRouteHandler`
with a `fileRouter` that:

- Requires `auth().user?.id` in `middleware`; throws
  `UploadThingError('Unauthenticated')` if absent → the SDK maps to a
  401 response body-identical to the framework's convention.
- Restricts to `imageUploader` with `image/{jpeg,png,webp,gif}` and
  `maxFileSize: '5MB'`.
- Returns `{ url }` from `onUploadComplete` — the URL is the only
  thing the client needs.

`DELETE /api/articles/{slug}` (from 4a) grows a cascade step. New
helper `lib/articles/image-keys.ts`:

- `collectImageKeys(article)` — walks the Tiptap body doc for `image`
  nodes, extracts each `src`, adds `coverImageUrl` if present, and
  parses out the trailing `<key>` path segment for each UploadThing
  URL. Returns `string[]` (deduped).
- Consumed by the DELETE route: after the SQL delete commits, filter
  the derived keys through `db.upload.findMany({ where: { key: { in:
  derived }, ownerId: session.user.id } })`. The intersection is what
  reaches `utapi.deleteFiles(keys)` — copy-pasted URLs from another
  author never make it. Call the storage in a try/catch; log
  failures with `{ articleId, keys }` and swallow. Never fails the
  request.
- The matching `Upload` rows are then deleted so a follow-up prune
  can use "row present, storage absent" as its orphan-detection
  signal.
- Under `E2E=1`, the SDK is swapped for the stub's `deleteFiles`,
  which removes the corresponding files from `test-results/uploads/`.

Upload ownership is recorded by `POST /api/uploadthing`: on a
successful `storage.uploadFile`, a row is `upsert`ed into `Upload`
with `{ key, url, ownerId: session.user.id }`. The unique constraint
on `key` plus the `upsert` keeps a retried request idempotent.

## UI surface

- `<CoverImageField>` — new component under `components/articles/`.
  Renders an "Upload cover image" `<UploadButton>` when empty; renders
  the preview + "Change cover image" + "Remove cover image" buttons
  when set. State lives on the parent `<ArticleForm>` (two more
  fields alongside `title`, `body`).
- `<ArticleEditor>` — 4b's component. Gains an "Add image" toolbar
  button that opens the SDK's uploader; on success, opens an
  `<AltTextDialog>` (`role="dialog"`, labelled "Add alt text"), and
  on confirm calls `editor.chain().focus().setImage({ src, alt }).run()`.
- `<ArticleView>` — 4b's component. Renders a `<figure>` above the
  title when `coverImageUrl` is set (`<img>` with the author's alt or
  empty string). No change to body rendering — Tiptap's `image`
  extension already emits `<img src alt>` inside the prose block.
- `<AltTextDialog>` — new. Same nested-form escape hatch as the 4b
  link dialog (plain `<div>` + type="button", manual Enter/Escape) so
  it doesn't submit the outer article form.

New dep additions:
- `uploadthing`, `@uploadthing/react`.
- `@tiptap/extension-image` (registered in the shared
  `articleExtensions` list so `generateHTML` renders it server-side).

## Environment

Two new env vars, documented in `.env.example` and `README.md`:

- `UPLOADTHING_TOKEN` — the SDK's server-side secret. Required in
  every deployment. Kept out of source; loaded by the SDK.
- `UPLOADTHING_URL_PREFIX` — optional. Overrides the default host
  regex used by the Zod validator. Set in test envs to point at the
  local CDN stub described below.

## Testing seams

E2E writes to a real UploadThing account are non-starters (cost, flake,
external dependency in the test path). Two levers:

- `E2E=1` guard already exists (`playwright.config.ts` sets it on the
  webServer). When `E2E === '1'`, the upload router replaces
  UploadThing's remote presign step with an in-memory stub that
  records the file bytes to `test-results/uploads/<key>` and returns
  a URL of the form `http://localhost:3000/__test-uploads/<key>`.
- `app/api/__test-uploads/[key]/route.ts` serves those files back
  under `E2E=1` only — 404 in every other env. This is the same
  seam-doctrine that `auth.md` § Testing seams established.
- The stub also implements `deleteFiles(keys: string[])`, which
  removes the corresponding `test-results/uploads/<key>` entries. The
  DELETE cascade calls into this instead of the real SDK when `E2E=1`,
  so tests can assert files are gone without hitting the network.

The URL allowlist is env-driven so the same schema imports work in
both real and stubbed modes. Under `E2E=1`, the allowlist adds
`http://localhost:3000/__test-uploads/`.

## E2E test plan

- `e2e/tests/articles/cover-image.spec.ts` — new.
  - Upload + preview + submit + read hero. `@smoke`
  - Change cover then submit. `@regression`
  - Remove cover then submit — hero disappears. `@regression`
- `e2e/tests/articles/inline-image.spec.ts` — new.
  - Add image via toolbar, enter alt, insert, submit, verify rendered
    `<img>` in read view. `@smoke`
  - Confirm button disabled while alt is empty. `@regression`
  - Cancel dialog does NOT insert an image node. `@regression`
- `e2e/tests/articles/upload-errors.spec.ts` — new.
  - Over-cap file surfaces `role="alert"`. `@regression`
  - Wrong-MIME file surfaces `role="alert"`. `@regression`
- `e2e/api/uploads/uploadthing.spec.ts` — new.
  - Unauthenticated POST → 401. `@smoke @api`
  - Authenticated POST with valid multipart → 200 + `{ url, key }[]`.
    `@regression @api`
  - Off-host `body` image node → POST /api/articles 400. `@regression @api`
- `e2e/api/articles/crud.spec.ts` — extended.
  - POST with `coverImageUrl` + `coverImageAlt` echoed on GET.
    `@smoke @api`
  - PATCH `coverImageUrl: null` clears both fields. `@regression @api`
  - DELETE an article with a cover + two inline images: assert the
    three corresponding files under `test-results/uploads/` are gone
    after the 204. `@regression @api`
  - DELETE when the stub's `deleteFiles` is forced to throw:
    request still returns 204; a warn-level log is emitted with the
    article id and the intended keys. `@regression @api`

`ArticleFormPage` POM grows:
- `coverImageButton`, `coverImagePreview`, `removeCoverButton`.
- `addImageButton` (toolbar).
- `altTextDialog`, `altTextField`, `altTextConfirm`.
- `uploadImage(path, { alt })` — factored helper that drives the
  UploadThing button + the alt-text dialog end-to-end.

`e2e/support/fixtures/`:
- `imageFactory` — returns a Node `Buffer` for a 1x1 png/jpeg/webp
  under a size cap of choice, plus a wildly-oversized buffer for the
  cap test. No test writes bytes to disk.

## Open questions

None — decisions locked in below.

## Decisions

1. **Upload backend: UploadThing.** SDK-driven auth handshake, a
   React `<UploadButton>` that meets the locator policy, free dev
   tier. Alternatives (Vercel Blob, local filesystem) rejected for
   parity with the roadmap notes in 4a/4b specs.
2. **Scope: cover + inline.** Both surfaces ship. Cover-only would
   leave the "Medium clone" story incomplete; inline-only would ship
   an odd asymmetry (rich body but no hero).
3. **Alt text required on inline; optional on cover.** Schema-enforced
   on the body (`z.string().min(1)` on `image.attrs.alt`). Cover is
   author-optional; renderer emits `alt=""` when absent (decorative).
4. **URL allowlist as security fence.** `image.attrs.src` and
   `coverImageUrl` must resolve to the UploadThing host allowlist.
   This is the boundary that keeps a compromised POST from smuggling
   tracker pixels or off-origin phishing bait.
5. **Test seam via `E2E=1` upload stub.** Real UploadThing calls are
   forbidden from the test path. The stub records to `test-results/`
   and serves back via a gated `__test-uploads` route — identical
   doctrine to the `E2E=1` auth seams.
6. **Delete-cascade of uploaded files: in-scope, best-effort inline.**
   `DELETE /api/articles/{slug}` walks the article body + cover for
   UploadThing keys and calls `utapi.deleteFiles` after the SQL delete
   commits. Failures are logged and swallowed — the DB row is the
   source of truth, so a stray file in the bucket never blocks the
   request. Chose this over "deferred + prune CLI" because (a) users
   often delete precisely because they regret the content, so
   leak-by-default is a real privacy cost, not tidiness; (b) the
   reconciliation problem for a later prune (walk the bucket, diff
   against DB) is strictly harder than doing the cascade at the write
   boundary; (c) our schema doesn't share images across articles, so
   no refcounting is needed today.
