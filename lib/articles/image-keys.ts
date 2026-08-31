/**
 * Extract UploadThing file keys from an article's cover + body. The
 * DELETE cascade in `app/api/articles/[slug]/route.ts` calls this after
 * committing the SQL delete so it can fire best-effort
 * `utapi.deleteFiles(keys)` against the storage backend. See
 * docs/specs/articles-images.md § API surface (DELETE).
 *
 * Keys are deduped — the same image URL appearing in multiple places
 * (e.g. cover + inline reuse) collapses to a single delete call.
 */
import type { TiptapDoc } from "@/lib/articles/tiptap";
import { extractUploadKey } from "@/lib/uploads/host-allowlist";

type ArticleShape = {
  coverImageUrl: string | null;
  body: TiptapDoc | unknown; // Prisma types it as Json; we walk defensively.
};

/**
 * Walk `article.body` for `image` nodes, collect each node's `src`,
 * plus the article's `coverImageUrl`. Convert URLs to file keys via
 * `extractUploadKey` (which enforces the same host allowlist Zod uses
 * on write — off-host URLs never made it past write, but the read
 * path is defensive anyway). Returns deduped keys.
 */
export function collectImageKeys(article: ArticleShape): string[] {
  const urls: string[] = [];
  if (typeof article.coverImageUrl === "string" && article.coverImageUrl.length > 0) {
    urls.push(article.coverImageUrl);
  }
  collectImageSrcs(article.body, urls);
  const keys = urls
    .map((u) => extractUploadKey(u))
    .filter((k): k is string => typeof k === "string" && k.length > 0);
  return Array.from(new Set(keys));
}

/** Depth-first walk collecting every `image` node's `src` string. */
function collectImageSrcs(node: unknown, out: string[]): void {
  if (!node || typeof node !== "object") return;
  const n = node as {
    type?: unknown;
    attrs?: { src?: unknown } | null;
    content?: unknown;
  };
  if (n.type === "image") {
    const src = n.attrs?.src;
    if (typeof src === "string" && src.length > 0) {
      out.push(src);
    }
  }
  if (Array.isArray(n.content)) {
    for (const child of n.content) {
      collectImageSrcs(child, out);
    }
  }
}
