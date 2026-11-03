import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Navbar from "@/components/Navbar";

// Everything under this layout is private financial data tied to the
// current session — never statically prerender or cache it.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  return (
    <>
      <Navbar />
      <main className="container">{children}</main>
    </>
  );
}
