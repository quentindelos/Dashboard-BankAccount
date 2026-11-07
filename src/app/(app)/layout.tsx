import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import TrDropZone from "@/components/TrDropZone";

// Everything under this layout is private financial data tied to the
// current session, so never statically prerender or cache it.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main">
        <main className="container">{children}</main>
      </div>
      <TrDropZone />
    </div>
  );
}
