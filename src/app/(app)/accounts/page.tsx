import { prisma } from "@/lib/db";
import AccountsManager from "@/components/AccountsManager";
import { institutionLogo } from "@/lib/logos";

export default async function AccountsPage() {
  const accounts = await prisma.account.findMany({
    // Vehicles and gold are on the Biens page.
    where: { archived: false, type: { notIn: ["VEHICULE", "OR"] } },
    orderBy: { createdAt: "asc" },
    include: { entries: { orderBy: { date: "desc" }, take: 1 } },
  });

  const initialAccounts = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    institution: a.institution,
    logo: institutionLogo(a.institution),
    latestValue: a.entries[0]?.value ?? null,
    latestDate: a.entries[0]?.date.toISOString() ?? null,
  }));

  return <AccountsManager initialAccounts={initialAccounts} />;
}
