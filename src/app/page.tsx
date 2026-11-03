import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// This reads live DB/session state on every request — never statically prerender it.
export const dynamic = "force-dynamic";

export default async function RootPage() {
  const user = await prisma.user.findFirst({ where: { totpEnabled: true } });
  if (!user) redirect("/setup");

  const session = await getSession();
  if (!session.userId) redirect("/login");

  redirect("/dashboard");
}
