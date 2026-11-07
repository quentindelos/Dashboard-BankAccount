// Portfolio analysis: look-through exposure, risk estimate, stress tests and
// rule-based advice. Pure functions over the data loaded by portfolio.ts.
//
// Everything here is an ESTIMATE built from static reference data
// (instruments.ts): useful to spot imbalances, not a substitute for advice.

import {
  ACWI_REGIONS,
  ACWI_SECTORS,
  ASSET_CLASS_LABELS,
  CURRENCY_LABELS,
  REGION_LABELS,
  SECTOR_LABELS,
  findInstrument,
  type AssetClass,
  type Currency,
  type InstrumentMeta,
  type Region,
  type Sector,
} from "@/lib/instruments";
import { accountTypeLabel } from "@/lib/accountTypes";
import type { HoldingRow, OtherAssetRow } from "@/lib/portfolio";
import type { AppSettings } from "@/lib/settings";
import { cushionProjection } from "@/lib/expenses";

export type AssetClassKey = AssetClass | "matelas" | "autre";

export interface Cushion {
  amount: number;
  accounts: { name: string; value: number }[];
  monthlyExpenses: number | null;
  targetMonths: number;
  target: number | null;
  monthsCovered: number | null;
  /** Monthly savings transfers going to the cushion accounts. */
  monthlyContribution: number;
  /** When the target will be reached at that pace (ISO date), if not yet. */
  reachDate: string | null;
}

export interface Slice {
  key: string;
  label: string;
  value: number;
  pct: number; // 0..1 of the slice's base
  benchmark?: number; // 0..1, ACWI reference
}

export interface CompanyExposure {
  name: string;
  direct: number;
  viaFunds: number;
  total: number;
  pct: number; // of equities
}

export interface StressTest {
  label: string;
  description: string;
  impact: number; // EUR, negative = loss
  pct: number; // of total
}

export type AdviceLevel = "important" | "attention" | "info" | "ok";

export interface Advice {
  level: AdviceLevel;
  title: string;
  body: string;
}

export interface Analysis {
  total: number;
  invested: number;
  equity: number;
  gains: { cost: number; value: number; gain: number; pct: number } | null;
  cushion: Cushion;
  assetClasses: Slice[];
  envelopes: Slice[];
  regions: Slice[];
  sectors: Slice[];
  currencies: Slice[];
  companies: CompanyExposure[];
  volatility: number; // whole patrimoine
  investedVolatility: number; // holdings only
  riskLevel: number; // 1..7, PRIIPs-like scale on investedVolatility
  stress: StressTest[];
  unclassified: string[];
  advice: Advice[];
}

const LIVRET_JEUNE_CAP = 1600;

interface Line {
  name: string;
  value: number;
  accountType: string;
  accountName: string;
  assetClass: AssetClassKey;
  volatility: number;
  meta: InstrumentMeta | null;
  holding?: HoldingRow;
}

function otherAssetClass(o: OtherAssetRow): AssetClassKey {
  if (o.emergencyFund) return "matelas";
  const type = o.accountType;
  if (type === "LIVRET") return "liquidites";
  if (type === "ASSURANCE_VIE" || type === "PER") return "fonds_euros";
  if (type === "OR") return "or";
  return "autre";
}

const CLASS_VOL: Record<AssetClassKey, number> = {
  actions: 0.18,
  or: 0.15,
  crypto: 0.6,
  matelas: 0,
  liquidites: 0,
  fonds_euros: 0.01,
  autre: 0.1,
};

function correlation(a: Line, b: Line): number {
  if (a === b) return 1;
  const pair = [a.assetClass, b.assetClass].sort().join("+");
  const table: Record<string, number> = {
    "actions+actions": 0.7,
    "actions+or": 0.1,
    "actions+crypto": 0.35,
    "crypto+or": 0.15,
    "crypto+crypto": 0.8,
    "or+or": 0.95,
    "actions+autre": 0.5,
    "autre+autre": 0.5,
  };
  return table[pair] ?? 0;
}

function portfolioVolatility(lines: Line[]): number {
  const total = lines.reduce((s, l) => s + l.value, 0);
  if (total <= 0) return 0;
  let variance = 0;
  for (const a of lines) {
    for (const b of lines) {
      variance += (a.value / total) * (b.value / total) * a.volatility * b.volatility * correlation(a, b);
    }
  }
  return Math.sqrt(Math.max(variance, 0));
}

function riskLevelFromVol(vol: number): number {
  const bands = [0.005, 0.05, 0.12, 0.2, 0.3, 0.8];
  const idx = bands.findIndex((b) => vol < b);
  return idx === -1 ? 7 : idx + 1;
}

function toSlices<K extends string>(
  values: Map<K, number>,
  labels: Record<string, string>,
  base: number,
  benchmark?: Record<string, number>
): Slice[] {
  const keys = new Set<string>([...values.keys(), ...(benchmark ? Object.keys(benchmark) : [])]);
  return Array.from(keys)
    .map((key) => {
      const value = values.get(key as K) ?? 0;
      return {
        key,
        label: labels[key] ?? key,
        value,
        pct: base > 0 ? value / base : 0,
        ...(benchmark ? { benchmark: benchmark[key] ?? 0 } : {}),
      };
    })
    .filter((s) => s.value > 0.005 || (s.benchmark ?? 0) > 0)
    .sort((a, b) => b.value - a.value || (b.benchmark ?? 0) - (a.benchmark ?? 0));
}

function add<K>(map: Map<K, number>, key: K, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const monthYear = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits).replace(".", ",")} %`;

export function analyzePortfolio(holdings: HoldingRow[], allOtherAssets: OtherAssetRow[], settings: AppSettings): Analysis {
  // Vehicles count in the net worth but not in the analysis of the savings and investments.
  const otherAssets = allOtherAssets.filter((o) => o.accountType !== "VEHICULE");
  const lines: Line[] = [
    ...holdings.map((h) => {
      const meta = findInstrument(h.isin, h.name);
      const assetClass: AssetClassKey = meta?.assetClass ?? "autre";
      return {
        name: meta?.label ?? h.name,
        value: h.value,
        accountType: h.accountType,
        accountName: h.accountName,
        assetClass,
        volatility: meta?.volatility ?? CLASS_VOL[assetClass],
        meta,
        holding: h,
      };
    }),
    ...otherAssets.map((o) => {
      const assetClass = otherAssetClass(o);
      return {
        name: o.accountName,
        value: o.value,
        accountType: o.accountType,
        accountName: o.accountName,
        assetClass,
        volatility: CLASS_VOL[assetClass],
        meta: null,
      };
    }),
  ];

  const total = lines.reduce((s, l) => s + l.value, 0);
  const holdingLines = lines.filter((l) => l.holding);
  const invested = holdingLines.reduce((s, l) => s + l.value, 0);
  const equityLines = lines.filter((l) => l.assetClass === "actions");
  const equity = equityLines.reduce((s, l) => s + l.value, 0);

  // ---- Allocation ----
  const classMap = new Map<string, number>();
  const envelopeMap = new Map<string, number>();
  const regionMap = new Map<Region, number>();
  const sectorMap = new Map<Sector, number>();
  const currencyMap = new Map<Currency, number>();
  const companies = new Map<string, { direct: number; viaFunds: number }>();

  for (const l of lines) {
    add(classMap, l.assetClass, l.value);
    add(envelopeMap, l.accountType, l.value);

    const currencies = l.meta?.currencies ?? { EUR: 1 };
    for (const [c, w] of Object.entries(currencies)) add(currencyMap, c as Currency, l.value * (w ?? 0));

    if (l.assetClass !== "actions" || !l.meta) continue;
    for (const [r, w] of Object.entries(l.meta.regions ?? {})) add(regionMap, r as Region, l.value * (w ?? 0));
    for (const [s, w] of Object.entries(l.meta.sectors ?? {})) add(sectorMap, s as Sector, l.value * (w ?? 0));

    if (l.meta.kind === "action") {
      const c = companies.get(l.meta.label) ?? { direct: 0, viaFunds: 0 };
      c.direct += l.value;
      companies.set(l.meta.label, c);
    }
    for (const th of l.meta.topHoldings ?? []) {
      const c = companies.get(th.name) ?? { direct: 0, viaFunds: 0 };
      c.viaFunds += l.value * th.weight;
      companies.set(th.name, c);
    }
  }

  const classifiedEquity = Array.from(regionMap.values()).reduce((s, v) => s + v, 0);

  const assetClasses = toSlices(
    classMap,
    { ...ASSET_CLASS_LABELS, liquidites: "Autres liquidités", matelas: "Matelas de sécurité", autre: "Non détaillé" },
    total
  );

  // ---- Safety cushion ----
  const cushionAccounts = otherAssets.filter((o) => o.emergencyFund);
  const cushionAmount = cushionAccounts.reduce((s, o) => s + o.value, 0);
  const cushionTarget = settings.monthlyExpenses ? settings.monthlyExpenses * settings.cushionMonths : null;
  const cushion: Cushion = {
    amount: cushionAmount,
    accounts: cushionAccounts.map((o) => ({ name: o.accountName, value: o.value })),
    monthlyExpenses: settings.monthlyExpenses,
    targetMonths: settings.cushionMonths,
    target: cushionTarget,
    monthsCovered: settings.monthlyExpenses ? cushionAmount / settings.monthlyExpenses : null,
    monthlyContribution: 0,
    reachDate: null,
  };
  if (cushionTarget) {
    const projection = cushionProjection(cushionAmount, cushionTarget, settings.cushionTransfers ?? []);
    cushion.monthlyContribution = projection.monthly;
    cushion.reachDate = projection.date ? projection.date.toISOString() : null;
  } else {
    cushion.monthlyContribution = (settings.cushionTransfers ?? []).reduce((s, t) => s + t.amount, 0);
  }
  const envelopeLabels = Object.fromEntries(Array.from(envelopeMap.keys()).map((k) => [k, accountTypeLabel(k)]));
  const envelopes = toSlices(envelopeMap, envelopeLabels, total);
  const regions = toSlices(regionMap, REGION_LABELS, classifiedEquity, ACWI_REGIONS);
  const sectors = toSlices(sectorMap, SECTOR_LABELS, classifiedEquity, ACWI_SECTORS);
  const currencies = toSlices(currencyMap, CURRENCY_LABELS, total);

  const companyList: CompanyExposure[] = Array.from(companies.entries())
    .map(([name, c]) => ({ name, ...c, total: c.direct + c.viaFunds, pct: equity > 0 ? (c.direct + c.viaFunds) / equity : 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // ---- Gains ----
  const withCost = holdings.filter((h) => h.costBasis !== null);
  const cost = withCost.reduce((s, h) => s + h.quantity * (h.costBasis ?? 0), 0);
  const costValue = withCost.reduce((s, h) => s + h.value, 0);
  const gains = withCost.length > 0 ? { cost, value: costValue, gain: costValue - cost, pct: cost > 0 ? (costValue - cost) / cost : 0 } : null;

  // ---- Risk ----
  const volatility = portfolioVolatility(lines);
  const investedVolatility = portfolioVolatility(holdingLines);
  const riskLevel = riskLevelFromVol(investedVolatility);

  const classValue = (k: AssetClassKey) => classMap.get(k) ?? 0;
  const usd = currencyMap.get("USD") ?? 0;
  const directStocks = lines.filter((l) => l.meta?.kind === "action").sort((a, b) => b.value - a.value);
  const biggestStock = directStocks[0];

  const stressDefs: { label: string; description: string; impact: number }[] = [
    {
      label: "Krach boursier",
      description: "Les actions perdent 35 % (ordre de grandeur de 2020 ou 2022 cumulé)",
      impact: -0.35 * classValue("actions"),
    },
    {
      label: "Crise majeure type 2008",
      description: "Actions −50 %, crypto −75 %, or +10 %",
      impact: -0.5 * classValue("actions") - 0.75 * classValue("crypto") + 0.1 * classValue("or"),
    },
    {
      label: "Chute du dollar",
      description: "Le dollar perd 15 % face à l'euro (actifs US, or et crypto)",
      impact: -0.15 * usd,
    },
    {
      label: "Hiver crypto",
      description: "Les cryptomonnaies perdent 75 %",
      impact: -0.75 * classValue("crypto"),
    },
  ];
  if (biggestStock) {
    stressDefs.push({
      label: `${biggestStock.name} −50 %`,
      description: "Ton plus gros titre en direct divisé par deux (résultats, scandale, secteur)",
      impact: -0.5 * biggestStock.value,
    });
  }
  const stress = stressDefs
    .filter((s) => Math.abs(s.impact) >= 1)
    .map((s) => ({ ...s, pct: total > 0 ? s.impact / total : 0 }))
    .sort((a, b) => a.impact - b.impact);

  const unclassified = holdings.filter((h) => !findInstrument(h.isin, h.name)).map((h) => h.name);

  // ---- Advice ----
  const advice: Advice[] = [];

  if (biggestStock && total > 0) {
    const w = biggestStock.value / total;
    if (w > 0.05) {
      const inEnvelope = lines.filter((l) => l.accountName === biggestStock.accountName).reduce((s, l) => s + l.value, 0);
      advice.push({
        level: w > 0.1 ? "important" : "attention",
        title: `${biggestStock.name} pèse ${pct(w)} de ton patrimoine`,
        body:
          `Un seul titre représente ${eur.format(biggestStock.value)}, soit ${pct(biggestStock.value / inEnvelope)} de ton ${biggestStock.accountName}. ` +
          `Une action isolée peut perdre 30 à 50 % sur une mauvaise année, un risque qu'un ETF dilue. ` +
          `Pour réduire progressivement sans rien vendre : oriente tes prochains versements vers tes ETF.` +
          (biggestStock.accountType === "PEA" ? " Et si tu arbitres, une vente à l'intérieur du PEA n'est pas imposée tant que tu ne retires rien." : ""),
      });
    }
  }

  const sectorAlerts = sectors.filter((s) => s.pct > 0.15 && s.pct > 2 * (s.benchmark ?? 0));
  for (const s of sectorAlerts) {
    advice.push({
      level: s.pct > 0.25 ? "important" : "attention",
      title: `Secteur ${s.label.toLowerCase()} surpondéré : ${pct(s.pct)} de tes actions`,
      body: `C'est ${(s.pct / Math.max(s.benchmark ?? 0.01, 0.01)).toFixed(0)} fois son poids dans un portefeuille mondial (${pct(s.benchmark ?? 0, 1)}). Ton résultat dépend beaucoup de ce seul secteur.`,
    });
  }

  if (classifiedEquity > 0) {
    const r = (k: Region) => regions.find((x) => x.key === k);
    const missing = regions.filter((x) => x.value < 1 && (x.benchmark ?? 0) >= 0.03).map((x) => x.label);
    const europe = r("europe");
    const parts: string[] = [];
    if (europe && europe.pct > 2 * (europe.benchmark ?? 0)) {
      parts.push(`l'Europe pèse ${pct(europe.pct)} de tes actions contre ${pct(europe.benchmark ?? 0)} dans l'indice mondial`);
    }
    if (missing.length > 0) parts.push(`aucune exposition à : ${missing.join(", ")}`);
    if (parts.length > 0) {
      parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      advice.push({
        level: "info",
        title: "Répartition géographique éloignée du marché mondial",
        body: `${parts.join(" ; ")}. Ce n'est pas une erreur si c'est voulu. Sinon, un ETF MSCI World éligible PEA couvre plus de 1 300 sociétés dans 23 pays développés en une seule ligne.`,
      });
    }
  }

  const overlaps = companyList.filter((c) => c.direct > 0 && c.viaFunds > 0);
  if (overlaps.length > 0) {
    advice.push({
      level: "info",
      title: "Doublons entre tes actions et tes ETF",
      body:
        overlaps.map((c) => `${c.name} (${eur.format(c.direct)} en direct + ~${eur.format(c.viaFunds)} via tes ETF)`).join(", ") +
        ". Tu détiens déjà ces sociétés dans ton ETF : les acheter en direct augmente leur poids sans ajouter de diversification.",
    });
  }

  if (cushion.accounts.length === 0) {
    advice.push({
      level: "attention",
      title: "Aucun matelas de sécurité défini",
      body: "Indique dans Dépenses le ou les livrets qui servent d'épargne de précaution : de l'argent disponible sans risque en cas d'imprévu, pour ne pas avoir à vendre tes placements au mauvais moment.",
    });
  } else if (cushion.monthsCovered === null) {
    advice.push({
      level: "info",
      title: `Matelas de sécurité : ${eur.format(cushion.amount)}`,
      body: "Ajoute tes charges du mois dans Dépenses pour savoir combien de mois ce matelas couvre. L'usage est de garder 3 à 6 mois de dépenses.",
    });
  } else {
    const months = cushion.monthsCovered;
    const missing = Math.max((cushion.target ?? 0) - cushion.amount, 0);
    advice.push({
      level: months < 3 ? "important" : months < cushion.targetMonths ? "attention" : "ok",
      title:
        months >= cushion.targetMonths
          ? `Matelas de sécurité complet : ${months.toFixed(1).replace(".", ",")} mois de dépenses`
          : `Matelas de sécurité : ${months.toFixed(1).replace(".", ",")} mois sur ${cushion.targetMonths}`,
      body:
        months >= cushion.targetMonths
          ? `${eur.format(cushion.amount)} disponibles pour un objectif de ${eur.format(cushion.target ?? 0)}. Ce qui dépasse cet objectif peut être investi.`
          : `Il manque ${eur.format(missing)} pour atteindre ${eur.format(cushion.target ?? 0)}.${
              cushion.reachDate
                ? ` Au rythme de ${eur.format(cushion.monthlyContribution)} par mois, il sera complet vers ${monthYear.format(new Date(cushion.reachDate))}.`
                : " Programme un virement mensuel vers ce livret (dans Dépenses, catégorie Épargne) pour savoir quand il sera complet."
            } Tant qu'il n'est pas complet, alimente-le avant d'ajouter de l'argent en bourse, pour ne pas avoir à vendre au mauvais moment.`,
    });
  }

  const livretJeune = otherAssets.find((o) => o.accountType === "LIVRET" && /jeune/i.test(o.accountName));
  const otherLivrets = otherAssets.filter((o) => o.accountType === "LIVRET" && o !== livretJeune).reduce((s, o) => s + o.value, 0);
  if (livretJeune && livretJeune.value < LIVRET_JEUNE_CAP && otherLivrets > 0) {
    advice.push({
      level: "info",
      title: `Livret Jeune rempli à ${pct(livretJeune.value / LIVRET_JEUNE_CAP)}`,
      body: `${eur.format(livretJeune.value)} sur un plafond de ${eur.format(LIVRET_JEUNE_CAP)}. Son taux est au moins égal à celui du Livret A et l'argent reste disponible à tout moment : il peut porter une partie de ton matelas à la place de tes autres livrets (${eur.format(otherLivrets)} actuellement).`,
    });
  }

  const ctoEligible = holdingLines.filter((l) => l.accountType === "CTO" && l.meta?.peaEligible);
  if (ctoEligible.length > 0) {
    advice.push({
      level: "attention",
      title: "Des titres éligibles au PEA sont sur ton CTO",
      body: `${ctoEligible.map((l) => l.name).join(", ")} : sur le PEA, les plus-values seraient exonérées d'impôt sur le revenu après 5 ans. Pense au PEA pour tes prochains achats de ces titres.`,
    });
  } else if (holdingLines.some((l) => l.accountType === "CTO") && holdingLines.some((l) => l.accountType === "PEA")) {
    advice.push({
      level: "ok",
      title: "Bonne répartition PEA / CTO",
      body: "Ton CTO ne contient que des titres non éligibles au PEA (actions US, or, etc.) et tes ETF sont sur le PEA, l'enveloppe la plus avantageuse fiscalement.",
    });
  }

  const ctoLosses = holdings.filter((h) => h.accountType === "CTO" && h.costBasis !== null && h.value < h.quantity * h.costBasis);
  if (ctoLosses.length > 0) {
    const loss = ctoLosses.reduce((s, h) => s + (h.value - h.quantity * (h.costBasis ?? 0)), 0);
    advice.push({
      level: "info",
      title: `Moins-value latente sur ton CTO : ${eur.format(loss)}`,
      body: `${ctoLosses.map((h) => h.name).join(", ")}. Si tu vends une ligne en moins-value, la perte s'impute sur tes plus-values du CTO de la même année et des 10 suivantes : à garder en tête avant de vendre une ligne gagnante.`,
    });
  }

  const cryptoShare = total > 0 ? classValue("crypto") / total : 0;
  if (cryptoShare > 0.05) {
    advice.push({
      level: cryptoShare > 0.1 ? "important" : "attention",
      title: `Crypto : ${pct(cryptoShare)} du patrimoine`,
      body: "Au-delà de 5 %, une chute de 75 % (déjà arrivée plusieurs fois) se voit nettement sur ton patrimoine total.",
    });
  }

  if (invested > 0) {
    const small = holdingLines.filter((l) => l.value / invested < 0.02);
    if (small.length >= 3) {
      const smallTotal = small.reduce((s, l) => s + l.value, 0);
      advice.push({
        level: "info",
        title: `${small.length} petites lignes de moins de 2 % chacune`,
        body: `${small.map((l) => l.name).join(", ")} : ${eur.format(smallTotal)} au total. Elles n'ont presque pas d'effet sur ton résultat, mais compliquent le suivi. Soit tu les assumes comme des paris « satellites », soit tu simplifies autour de tes ETF.`,
      });
    }
  }

  if (otherAssets.some((o) => o.accountType === "ASSURANCE_VIE")) {
    advice.push({
      level: "info",
      title: "Assurance vie comptée en fonds euros",
      body: "Faute de détail des supports, elle est considérée comme sans risque dans l'analyse. Si elle contient des unités de compte (actions, ETF...), ton exposition réelle aux actions est plus élevée qu'affiché.",
    });
  }

  if (unclassified.length > 0) {
    advice.push({
      level: "attention",
      title: "Titres non reconnus",
      body: `${unclassified.join(", ")} : ajoute-les dans src/lib/instruments.ts pour qu'ils soient pris en compte dans l'exposition.`,
    });
  }

  const order: Record<AdviceLevel, number> = { important: 0, attention: 1, info: 2, ok: 3 };
  advice.sort((a, b) => order[a.level] - order[b.level]);

  return {
    total,
    invested,
    equity,
    gains,
    cushion,
    assetClasses,
    envelopes,
    regions,
    sectors,
    currencies,
    companies: companyList,
    volatility,
    investedVolatility,
    riskLevel,
    stress,
    unclassified,
    advice,
  };
}
