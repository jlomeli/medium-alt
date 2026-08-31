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
import { useState, useEffect } from "react";
import { articleExtensions } from "@/lib/articles/tiptap-extensions";
import type { TiptapDoc } from "@/lib/articles/tiptap";

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

  return (
    <div>
      <Toolbar
        editor={editor}
        onOpenLink={() => {
          setLinkUrl(editor.getAttributes("link").href ?? "");
          setLinkOpen(true);
        }}
      />
      <EditorContent editor={editor} />
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
    </div>
  );
}

// -------- Toolbar --------

interface ToolbarProps {
  editor: Editor;
  onOpenLink: () => void;
}

function Toolbar({ editor, onOpenLink }: ToolbarProps) {
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
