import { prisma } from "@/lib/db";
import AssetsManager, { type AssetCardData } from "@/components/AssetsManager";
import { fineGrams, parseGoldDetails, parseVehicleDetails, photoUrl, vehicleTitle } from "@/lib/physicalAssets";
import { refreshValuations } from "@/lib/valuations";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const gramsFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export default async function AssetsPage() {
  await refreshValuations();
  const accounts = await prisma.account.findMany({
    where: { archived: false, type: { in: ["VEHICULE", "OR"] } },
    orderBy: { createdAt: "asc" },
    include: { entries: { orderBy: { date: "desc" }, take: 1 } },
  });

  const assets: AssetCardData[] = accounts.map((a) => {
    const latest = a.entries[0];
    let description: string | null = null;
    let valuedHow: string | null = latest ? `Valeur au ${dateFmt.format(latest.date)}` : null;
    if (a.type === "VEHICULE") {
      const v = parseVehicleDetails(a.details);
      if (v) description = vehicleTitle(v);
      if (v?.estimate) valuedHow = `Cote estimée le ${dateFmt.format(new Date(v.estimate.date))}`;
    } else {
      const g = parseGoldDetails(a.details);
      if (g) description = `${gramsFmt.format(fineGrams(g))} g d'or fin`;
      if (g && latest) valuedHow = "Au cours de l'or du jour";
    }
    return {
      id: a.id,
      name: a.name,
      type: a.type as AssetCardData["type"],
      photoUrl: a.photo ? photoUrl(a.id, a.photo) : null,
      description,
      value: latest?.value ?? null,
      valuedHow,
    };
  });

  return <AssetsManager assets={assets} />;
}
