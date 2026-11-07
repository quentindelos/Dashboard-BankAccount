import { prisma } from "@/lib/db";
import AccountsManager from "@/components/AccountsManager";
import { institutionLogo } from "@/lib/logos";
import { photoUrl } from "@/lib/physicalAssets";
import { refreshValuations } from "@/lib/valuations";

export default async function AccountsPage() {
  await refreshValuations();
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
    logo: institutionLogo(a.institution),
    photoUrl: a.photo ? photoUrl(a.id, a.photo) : null,
    latestValue: a.entries[0]?.value ?? null,
    latestDate: a.entries[0]?.date.toISOString() ?? null,
  }));

  return <AccountsManager initialAccounts={initialAccounts} />;
}
