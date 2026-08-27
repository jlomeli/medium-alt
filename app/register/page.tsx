import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  return <RegisterForm />;
}
