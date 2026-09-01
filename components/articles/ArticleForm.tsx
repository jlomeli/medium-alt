"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  createArticleSchema,
  updateArticleSchema,
} from "@/lib/validation/article";
import type { TiptapDoc } from "@/lib/articles/tiptap";
import { ArticleEditor } from "./ArticleEditor";
import { CoverImageField } from "./CoverImageField";

interface FieldErrors {
  title?: string;
  subtitle?: string;
  body?: string;
  coverImageUrl?: string;
  coverImageAlt?: string;
}

export interface ArticleFormValues {
  title: string;
  subtitle: string;
  /** Tiptap ProseMirror doc — the shape stored on `Article.body`. */
  body: TiptapDoc;
  /** UploadThing (or E2E stub) URL for the cover image. `null` when unset. */
  coverImageUrl: string | null;
  /** Author-supplied alt for the cover. `null` when blank (rendered as `alt=""`). */
  coverImageAlt: string | null;
  published: boolean;
}

interface Props {
  mode: "create" | "edit";
  initial: ArticleFormValues;
  /** Only set in edit mode — the slug is needed for the PATCH/DELETE URLs. */
  slug?: string;
}

export function ArticleForm({ mode, initial, slug }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [title, setTitle] = useState(initial.title);
  const [subtitle, setSubtitle] = useState(initial.subtitle);
  const [body, setBody] = useState<TiptapDoc>(initial.body);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(initial.coverImageUrl);
  const [coverImageAlt, setCoverImageAlt] = useState<string | null>(initial.coverImageAlt);
  const [published, setPublished] = useState(initial.published);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const heading = mode === "create" ? "New article" : "Edit article";
  const submitLabel = published ? "Publish" : "Save draft";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setErrors({});
    setTopLevelError(null);

    if (mode === "create") {
      const parsed = createArticleSchema.safeParse({
        title,
        subtitle: subtitle.length > 0 ? subtitle : undefined,
        body,
        coverImageUrl: coverImageUrl ?? undefined,
        coverImageAlt: coverImageAlt ?? undefined,
        published,
      });
      if (!parsed.success) {
        const first = parsed.error.issues[0]!;
        const field = String(first.path[0]) as keyof FieldErrors;
        setErrors({ [field]: first.message });
        return;
      }
    } else {
      // Edit — validate the same values against the update schema.
      const parsed = updateArticleSchema.safeParse({
        title,
        subtitle,
        body,
        // Cover fields are passed explicitly (including `null`) so the
        // PATCH handler's clear-both branch fires on removal — see spec §
        // API contract "coverImageUrl: null clears both".
        coverImageUrl,
        coverImageAlt,
        published,
      });
      if (!parsed.success) {
        const first = parsed.error.issues[0]!;
        const field = String(first.path[0]) as keyof FieldErrors;
        setErrors({ [field]: first.message });
        return;
      }
    }

    setSubmitting(true);
    let hadFailure = false;
    try {
      const url = mode === "create" ? "/api/articles" : `/api/articles/${slug}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          subtitle: subtitle.length > 0 ? subtitle : undefined,
          body,
          // POST accepts `null` to mean "no cover". PATCH treats `null`
          // as an explicit clear — both paths encode the same shape.
          coverImageUrl,
          coverImageAlt,
          published,
        }),
      });

      if (!res.ok) {
        hadFailure = true;
        const payload = (await res.json().catch(() => null)) as
          | { error?: { field?: string; message?: string } }
          | null;
        const err = payload?.error;
        if (err?.field) {
          setErrors({ [err.field as keyof FieldErrors]: err.message ?? "Invalid value" });
        } else {
          setTopLevelError("Something went wrong. Please try again.");
        }
        return;
      }

      const data = (await res.json()) as { article: { slug: string; published: boolean } };
      // Post-save navigation. See docs/specs/articles-crud.md § Create / Edit.
      const destination = data.article.published
        ? `/articles/${data.article.slug}`
        : `/articles/${data.article.slug}/edit`;
      router.push(destination);
      router.refresh();

      // Release the submission lock when the destination equals the
      // current pathname (canonical case: saving a draft from
      // `/articles/{slug}/edit` re-pushes the same URL). Without this
      // release the component never unmounts, so `submitting=true`
      // would leave the button disabled and the "Saving…" indicator
      // stuck until a full page reload. Cross-route saves keep the
      // lock so the transition window can't land a second concurrent
      // write (same reason as EditProfileForm).
      if (destination === pathname) setSubmitting(false);
    } catch {
      hadFailure = true;
      setTopLevelError("Couldn't reach the server. Please try again.");
    } finally {
      if (hadFailure) setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (deleting || mode !== "edit" || !slug) return;
    if (!window.confirm("Delete this article? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/articles/${slug}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        setTopLevelError("Could not delete the article.");
        setDeleting(false);
        return;
      }
      router.push("/me/articles");
      router.refresh();
    } catch {
      setTopLevelError("Couldn't reach the server. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 font-serif text-3xl font-bold">{heading}</h1>
      <form
        aria-label={heading}
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        <div>
          <label className="mb-1 block text-sm" htmlFor="title">
            Title
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
          />
          {errors.title && (
            <p role="alert" className="mt-1 text-sm text-red-600">
              {errors.title}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm" htmlFor="subtitle">
            Subtitle
          </label>
          <input
            id="subtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
          />
          {errors.subtitle && (
            <p role="alert" className="mt-1 text-sm text-red-600">
              {errors.subtitle}
            </p>
          )}
        </div>
        <CoverImageField
          value={coverImageUrl}
          altValue={coverImageAlt}
          onChange={(next) => {
            setCoverImageUrl(next.url);
            setCoverImageAlt(next.alt);
          }}
        />
        <div>
          <p id="article-body-label" className="mb-1 block text-sm">
            Body
          </p>
          <ArticleEditor
            value={body}
            onChange={setBody}
            labelId="article-body-label"
          />
          {errors.body && (
            <p role="alert" className="mt-1 text-sm text-red-600">
              {errors.body}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            id="published"
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          <label htmlFor="published" className="text-sm">
            Publish this article
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-black px-4 py-2 text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitLabel}
          </button>
          {mode === "edit" && slug && (
            <>
              <Link href={`/articles/${slug}`} className="text-sm">
                Cancel
              </Link>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="ml-auto rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Delete article
              </button>
            </>
          )}
        </div>
        {topLevelError && (
          <p role="alert" className="text-sm text-red-600">
            {topLevelError}
          </p>
        )}
        {submitting && <p className="text-sm text-neutral-500">Saving…</p>}
      </form>
    </main>
  );
}
