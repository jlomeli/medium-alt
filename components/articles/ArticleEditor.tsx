"use client";

/**
 * Tiptap-backed rich-text editor for the article body. Ships:
 *   - StarterKit (paragraph, headings h2/h3, lists, blockquote, code
 *     block, hard break, marks bold/italic/code) via
 *     `articleExtensions` — the same list the server renderer uses.
 *   - A visible `role="toolbar"` with every documented button
 *     labelled — every affordance is `getByRole('button', { name })`-
 *     reachable, no `data-testid`.
 *   - A small link dialog reachable via `role="dialog"` + labelled
 *     "URL" input, per docs/specs/articles-editor.md § Editor UI.
 *
 * The editor surface is `<EditorContent>` with `aria-label="Body"`,
 * which lets Playwright reach it with
 * `getByRole('textbox', { name: 'Body' })` — ProseMirror's
 * contenteditable exposes the textbox role natively.
 */
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { useState, useEffect, useRef } from "react";
import { articleExtensions } from "@/lib/articles/tiptap-extensions";
import type { TiptapDoc } from "@/lib/articles/tiptap";
import { uploadImage, UPLOAD_ERROR_COPY } from "@/lib/uploads/client";
import { UPLOAD_ACCEPT_ATTR } from "@/lib/uploads/policy";

interface Props {
  value: TiptapDoc;
  onChange: (doc: TiptapDoc) => void;
  /**
   * ID of the visible label element for the body. The contenteditable
   * div gets `aria-labelledby={labelId}` so
   * `getByRole('textbox', { name: 'Body' })` matches it.
   *
   * Contenteditables can't be associated via native `<label for>`
   * (they aren't form controls), and Tiptap's `editorProps.attributes`
   * doesn't consistently proxy `aria-label` through to the ProseMirror
   * root, so we pass the labelledby id explicitly.
   */
  labelId: string;
}

export function ArticleEditor({ value, onChange, labelId }: Props) {
  const editor = useEditor({
    extensions: articleExtensions,
    content: value,
    // SSR safety: don't try to render immediately when hydrating.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-labelledby": labelId,
        "aria-multiline": "true",
        class:
          "prose max-w-none min-h-[300px] rounded-md border px-3 py-2 focus:outline-none focus-visible:ring",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON() as TiptapDoc);
    },
  });

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  // Inline-image flow: hidden file input → upload → alt-text dialog →
  // `setImage`. `uploadedUrl` holds the fresh URL while the author
  // types alt text; cancelling the dialog drops it (no orphan node in
  // the doc). Upload errors surface via a `role="alert"` line under
  // the editor — same shape as `<CoverImageField>`'s error.
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [altOpen, setAltOpen] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  if (!editor) {
    // Placeholder markup so tests waiting on `role="toolbar"` don't
    // race the async editor initialisation.
    return (
      <div>
        <div role="toolbar" aria-label="Formatting" />
        <div
          role="textbox"
          aria-labelledby={labelId}
          aria-multiline="true"
          aria-busy="true"
          className="min-h-[300px] rounded-md border px-3 py-2 text-neutral-400"
        >
          Loading editor…
        </div>
      </div>
    );
  }

  async function handleImageFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so re-picking the same file re-fires `change`.
    event.target.value = "";
    if (!file) return;
    setUploadingImage(true);
    setImageError(null);
    const result = await uploadImage(file);
    setUploadingImage(false);
    if (!result.ok) {
      setImageError(result.message ?? UPLOAD_ERROR_COPY.unknown);
      return;
    }
    // Stash the URL and open the alt-text dialog. The image is NOT yet
    // in the doc — insertion only happens on confirm, keeping cancel
    // truly cancel-y (no orphan node, no orphan storage… well, one
    // orphan file, but that's the trade for a clean UX).
    setUploadedUrl(result.url);
    setAltOpen(true);
  }

  return (
    <div>
      <Toolbar
        editor={editor}
        onOpenLink={() => {
          setLinkUrl(editor.getAttributes("link").href ?? "");
          setLinkOpen(true);
        }}
        onAddImage={() => {
          setImageError(null);
          imageInputRef.current?.click();
        }}
        addImageDisabled={uploadingImage}
      />
      {/* Hidden native file input driven by the toolbar's Add-image button. */}
      <input
        ref={imageInputRef}
        type="file"
        accept={UPLOAD_ACCEPT_ATTR}
        onChange={handleImageFile}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      <EditorContent editor={editor} />
      {uploadingImage && (
        <p role="status" className="mt-2 text-sm text-neutral-500">
          Uploading image…
        </p>
      )}
      {imageError && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {imageError}
        </p>
      )}
      {linkOpen && (
        <LinkDialog
          initialUrl={linkUrl}
          onCancel={() => setLinkOpen(false)}
          onSubmit={(url) => {
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: url })
              .run();
            setLinkOpen(false);
          }}
        />
      )}
      {altOpen && uploadedUrl && (
        <AltTextDialog
          onCancel={() => {
            setAltOpen(false);
            setUploadedUrl(null);
          }}
          onSubmit={(alt) => {
            // Tiptap's Image extension registers `setImage({ src, alt })`.
            // Zod's body schema enforces `alt.min(1)` on the server;
            // the dialog also disables the confirm button while alt is
            // empty (belt + braces).
            editor
              .chain()
              .focus()
              .setImage({ src: uploadedUrl, alt })
              .run();
            setAltOpen(false);
            setUploadedUrl(null);
          }}
        />
      )}
    </div>
  );
}

// -------- Toolbar --------

interface ToolbarProps {
  editor: Editor;
  onOpenLink: () => void;
  onAddImage: () => void;
  addImageDisabled: boolean;
}

function Toolbar({ editor, onOpenLink, onAddImage, addImageDisabled }: ToolbarProps) {
  // Force a re-render when the selection changes so `aria-pressed`
  // stays honest. Tiptap's `editor.on('selectionUpdate')` + a state
  // bump is the idiomatic way.
  const [, tick] = useState(0);
  useEffect(() => {
    const rerender = () => tick((n) => n + 1);
    editor.on("selectionUpdate", rerender);
    editor.on("transaction", rerender);
    return () => {
      editor.off("selectionUpdate", rerender);
      editor.off("transaction", rerender);
    };
  }, [editor]);

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="mb-2 flex flex-wrap items-center gap-1 rounded-md border bg-neutral-50 p-1"
    >
      <TB label="Bold" active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}>
        <b>B</b>
      </TB>
      <TB label="Italic" active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}>
        <i>I</i>
      </TB>
      <TB label="Heading 2" active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        H2
      </TB>
      <TB label="Heading 3" active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        H3
      </TB>
      <TB label="Bullet list" active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}>
        • List
      </TB>
      <TB label="Numbered list" active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        1. List
      </TB>
      <TB label="Blockquote" active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        &ldquo;
      </TB>
      <TB label="Code block" active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        {"</>"}
      </TB>
      <TB label="Link" active={editor.isActive("link")} onClick={onOpenLink}>
        🔗
      </TB>
      <TB label="Add image" active={false} onClick={onAddImage} disabled={addImageDisabled}>
        🖼
      </TB>
      <TB label="Undo" active={false} onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}>
        ↶
      </TB>
      <TB label="Redo" active={false} onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}>
        ↷
      </TB>
    </div>
  );
}

/** Toolbar button. Always renders `aria-label` (for icon buttons) and
 *  `aria-pressed` so `getByRole('button', { name })` and
 *  `toHaveAttribute('aria-pressed', 'true'|'false')` work. */
function TB({
  label,
  active,
  onClick,
  disabled,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded px-2 py-1 text-sm hover:bg-neutral-200 disabled:opacity-40",
        active ? "bg-neutral-300" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// -------- Link dialog --------

interface LinkDialogProps {
  initialUrl: string;
  onCancel: () => void;
  onSubmit: (url: string) => void;
}

function LinkDialog({ initialUrl, onCancel, onSubmit }: LinkDialogProps) {
  const [url, setUrl] = useState(initialUrl);
  const apply = () => onSubmit(url);
  // Not a nested <form>: this dialog renders inside the ArticleForm's
  // `<form onSubmit={handleSubmit}>`. Browsers do not support nested
  // forms — the inner <form> tag is stripped, and any nested
  // `<button type="submit">` submits the OUTER form. Using a <div>
  // with an explicit `type="button"` Apply keeps this dialog inert
  // vis-à-vis the article form. Enter-to-submit is wired manually.
  return (
    <div
      role="dialog"
      aria-label="Add link"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          apply();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="w-full max-w-md rounded-md bg-white p-4 shadow-lg">
        <label htmlFor="link-url" className="mb-1 block text-sm font-medium">
          URL
        </label>
        <input
          id="link-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
          className="w-full rounded-md border px-3 py-2"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            className="rounded-md bg-black px-3 py-1.5 text-sm text-white"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// -------- Alt-text dialog --------

interface AltTextDialogProps {
  onCancel: () => void;
  onSubmit: (alt: string) => void;
}

/**
 * Alt-text prompt shown after a successful inline-image upload. Same
 * nested-form escape hatch as `<LinkDialog>` — a `<div role="dialog">`
 * with all buttons `type="button"` and manual Enter/Escape wiring, so
 * this dialog can't submit the outer `<ArticleForm>`. Confirm is
 * disabled while alt is empty (spec § Inline images: "screen-reader
 * users are never handed an image with no description"). The Zod
 * body schema also enforces `alt.min(1)` server-side.
 */
function AltTextDialog({ onCancel, onSubmit }: AltTextDialogProps) {
  const [alt, setAlt] = useState("");
  const canSubmit = alt.trim().length > 0;
  const apply = () => {
    if (!canSubmit) return;
    onSubmit(alt);
  };
  return (
    <div
      role="dialog"
      aria-label="Add alt text"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          apply();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="w-full max-w-md rounded-md bg-white p-4 shadow-lg">
        <label htmlFor="image-alt" className="mb-1 block text-sm font-medium">
          Alt text
        </label>
        <input
          id="image-alt"
          type="text"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          maxLength={200}
          autoFocus
          className="w-full rounded-md border px-3 py-2"
        />
        <p className="mt-1 text-xs text-neutral-500">
          Describe the image for screen readers. Required.
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!canSubmit}
            className="rounded-md bg-black px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Insert image
          </button>
        </div>
      </div>
    </div>
  );
}
