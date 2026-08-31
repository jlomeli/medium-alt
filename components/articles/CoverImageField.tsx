"use client";

/**
 * Cover-image field for the article form. Three visual states:
 *
 * 1. **Empty** — "Upload cover image" button + hidden `<input type="file">`.
 * 2. **Uploading** — button disabled, "Uploading…" status text visible.
 * 3. **Set** — `<img>` preview, "Change cover image" button, optional
 *    alt-text input, and a "Remove cover image" button that clears both
 *    the URL and the alt on the next save.
 *
 * State lives on the parent `<ArticleForm>` (two more fields alongside
 * `title`, `body`). This component just renders + drives the upload.
 *
 * Locator policy: the file input is hidden but a real `<button>` proxies
 * the click, so `getByRole('button', { name: /cover image/i })` resolves
 * without a `data-testid`. See docs/specs/articles-images.md § UI surface.
 */
import { useRef, useState } from "react";
import { uploadImage, UPLOAD_ERROR_COPY } from "@/lib/uploads/client";
import { UPLOAD_ACCEPT_ATTR } from "@/lib/uploads/policy";

interface Props {
  /** Current URL — `null` when no cover is set. */
  value: string | null;
  /** Current alt — `null` when the author left it blank. */
  altValue: string | null;
  onChange: (next: { url: string | null; alt: string | null }) => void;
}

export function CoverImageField({ value, altValue, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openPicker() {
    setError(null);
    inputRef.current?.click();
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Always reset the input so re-picking the same file fires `change` again.
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    const result = await uploadImage(file);
    setUploading(false);

    if (!result.ok) {
      setError(result.message ?? UPLOAD_ERROR_COPY.unknown);
      return;
    }
    // On replace, keep the existing alt — the author often wants the
    // same caption on the new image.
    onChange({ url: result.url, alt: altValue });
  }

  function handleAlt(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    onChange({ url: value, alt: next.length > 0 ? next : null });
  }

  function removeCover() {
    onChange({ url: null, alt: null });
    setError(null);
  }

  return (
    <div>
      <p id="cover-image-label" className="mb-1 block text-sm">
        Cover image
      </p>
      {/*
        Hidden native file input triggered by the visible button below.
        Kept unlabelled + `aria-hidden` so Playwright's `getByLabel`
        for the button label never resolves to it.
      */}
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT_ATTR}
        onChange={handleFile}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      {value ? (
        <div className="flex flex-col gap-3">
          {/* Plain `<img>` on purpose — same rationale as the read
              view's cover hero: the URL is already gated by the
              server-side upload-host allowlist, and next/image would
              require adding every upload origin (including the E2E
              stub) to next.config.js. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={altValue ?? ""}
            className="max-h-64 w-full rounded-md border object-cover"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openPicker}
              disabled={uploading}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
            >
              Change cover image
            </button>
            <button
              type="button"
              onClick={removeCover}
              disabled={uploading}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Remove cover image
            </button>
          </div>
          <div>
            <label htmlFor="cover-image-alt" className="mb-1 block text-xs text-neutral-600">
              Cover alt text (optional)
            </label>
            <input
              id="cover-image-alt"
              type="text"
              value={altValue ?? ""}
              onChange={handleAlt}
              maxLength={200}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          disabled={uploading}
          className="rounded-md border border-dashed px-4 py-6 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload cover image"}
        </button>
      )}
      {uploading && (
        <p role="status" className="mt-2 text-sm text-neutral-500">
          Uploading…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
