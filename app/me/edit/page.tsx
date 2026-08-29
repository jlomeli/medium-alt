import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { EditProfileForm } from "./edit-profile-form";

export default async function EditProfilePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fme%2Fedit");
  }
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, name: true, bio: true },
  });
  if (!user) redirect("/login");

  return (
    <EditProfileForm
      initial={{
        username: user.username ?? "",
        name: user.name ?? "",
        bio: user.bio ?? "",
      }}
    />
  );
}
