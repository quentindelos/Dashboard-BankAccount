import { prisma } from "@/lib/db";
import AccountsManager from "@/components/AccountsManager";

export default async function AccountsPage() {
  const accounts = await prisma.account.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
    include: { entries: { orderBy: { date: "desc" }, take: 1 } },
  });

  const initialAccounts = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    institution: a.institution,
    latestValue: a.entries[0]?.value ?? null,
    latestDate: a.entries[0]?.date.toISOString() ?? null,
  }));

  return <AccountsManager initialAccounts={initialAccounts} />;
}
