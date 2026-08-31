import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { ArticleForm } from "@/components/articles/ArticleForm";

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
        body: article.body,
        published: article.published,
      }}
    />
  );
}
