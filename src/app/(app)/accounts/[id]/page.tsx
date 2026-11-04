import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import AccountDetail from "@/components/AccountDetail";
import { findInstrument } from "@/lib/instruments";
import { institutionLogo, instrumentLogo } from "@/lib/logos";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await prisma.account.findUnique({
    where: { id },
    include: {
      entries: { orderBy: { date: "asc" } },
      positions: { orderBy: [{ date: "desc" }, { value: "desc" }] },
    },
  });
  if (!account) notFound();

  return (
    <AccountDetail
      account={{
        id: account.id,
        name: account.name,
        type: account.type,
        institution: account.institution,
        note: account.note,
        logo: institutionLogo(account.institution),
        contributions: account.contributions,
      }}
      entries={account.entries.map((e) => ({ id: e.id, date: e.date.toISOString(), value: e.value, note: e.note }))}
      positions={account.positions.map((p) => ({
        date: p.date.toISOString(),
        name: p.name,
        isin: p.isin,
        logo: instrumentLogo(p.isin, findInstrument(p.isin, p.name)?.label ?? p.name),
        quantity: p.quantity,
        price: p.price,
        value: p.value,
        costBasis: p.costBasis,
      }))}
    />
  );
}
