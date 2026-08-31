import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { ArticleForm } from "@/components/articles/ArticleForm";
import { emptyDoc } from "@/lib/articles/tiptap";

/**
 * `/articles/new` — server-gate + client form. Unauthenticated visitors
 * bounce to /login with a `callbackUrl` back here.
 */
export default async function NewArticlePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Farticles%2Fnew");
  }
  return (
    <ArticleForm
      mode="create"
      initial={{ title: "", subtitle: "", body: emptyDoc(), published: false }}
    />
  );
}
