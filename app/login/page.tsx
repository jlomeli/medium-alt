import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  return <LoginForm />;
}
