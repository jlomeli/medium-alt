import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { ArticleForm } from "@/components/articles/ArticleForm";
import type { TiptapDoc } from "@/lib/articles/tiptap";

/**
 * `/articles/[slug]/edit` — author-only. Non-authors get 404 (never
 * 403 — same "does not exist" leak defense used by the API).
 */
export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/login?callbackUrl=%2Farticles%2F${slug}%2Fedit`);
  }

  const article = await db.article.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      subtitle: true,
      body: true,
      coverImageUrl: true,
      coverImageAlt: true,
      published: true,
      authorId: true,
    },
  });
  if (!article || article.authorId !== session.user.id) notFound();

  return (
    <ArticleForm
      mode="edit"
      slug={article.slug}
      initial={{
        title: article.title,
        subtitle: article.subtitle ?? "",
        // Prisma types `Json` columns as `JsonValue`; the write-path Zod
        // schema guarantees the stored shape is a Tiptap doc, so a cast
        // at this boundary is safe.
        body: article.body as unknown as TiptapDoc,
        coverImageUrl: article.coverImageUrl,
        coverImageAlt: article.coverImageAlt,
        published: article.published,
      }}
    />
  );
}
