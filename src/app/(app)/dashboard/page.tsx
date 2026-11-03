import Link from "next/link";
import { prisma } from "@/lib/db";
import { buildNetWorthSeries } from "@/lib/networth";
import { ACCOUNT_TYPE_ORDER } from "@/lib/accountTypes";
import NetWorthCharts from "@/components/NetWorthCharts";

export default async function DashboardPage() {
  const accounts = await prisma.account.findMany({
    where: { archived: false },
    include: { entries: true },
    orderBy: { createdAt: "asc" },
  });

  if (accounts.length === 0) {
    return (
      <div className="card empty-state">
        <h2>Aucun compte pour l'instant</h2>
        <p className="muted">Ajoute ton assurance vie, tes livrets, ton CTO ou ton PEA pour démarrer le suivi.</p>
        <Link className="btn btn-primary" href="/accounts">
          Ajouter un compte
        </Link>
      </div>
    );
  }

  const entries = accounts.flatMap((a) => a.entries.map((e) => ({ accountId: a.id, date: e.date, value: e.value })));
  const accountList = accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }));
  const series = buildNetWorthSeries(accountList, entries);

  const presentTypes = ACCOUNT_TYPE_ORDER.filter((t) => accounts.some((a) => a.type === t));

  // Aggregate the per-account series into per-type series for the overview
  // chart (per-account detail lives on each account's own page).
  const seriesByType = series.map((point) => {
    const row: { date: string; total: number; [type: string]: string | number } = {
      date: point.date,
      total: point.total,
    };
    for (const type of presentTypes) {
      row[type] = accounts
        .filter((a) => a.type === type)
        .reduce((sum, a) => sum + (point.byAccount[a.id] ?? 0), 0);
    }
    return row;
  });

  const latest = series.at(-1);
  const previous = series.length > 1 ? series[series.length - 2] : null;
  const total = latest?.total ?? 0;
  const previousTotal = previous?.total ?? null;

  const breakdown = presentTypes
    .map((type) => ({
      type,
      value: accounts
        .filter((a) => a.type === type)
        .reduce((sum, a) => sum + (latest?.byAccount[a.id] ?? 0), 0),
    }))
    .filter((d) => d.value !== 0);

  return (
    <NetWorthCharts
      total={total}
      previousTotal={previousTotal}
      accountCount={accounts.length}
      presentTypes={presentTypes as string[]}
      seriesByType={seriesByType}
      breakdown={breakdown}
    />
  );
}
