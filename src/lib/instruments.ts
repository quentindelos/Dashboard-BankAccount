// Reference data for the instruments held, keyed by ISIN (or by name for
// lines without one, like crypto). Used for look-through exposure analysis.
//
// ETF breakdowns are APPROXIMATE (index weights, rounded) and drift over
// time. Good enough to read an allocation, not to trade on. Add a new
// instrument here when you buy something new; anything missing falls back
// to a generic "non classé" profile and is flagged in the Analyse page.

export type AssetClass = "actions" | "or" | "crypto" | "liquidites" | "fonds_euros";

export type Region = "amerique_nord" | "europe" | "japon" | "pacifique" | "emergents";

export type Sector =
  | "technologie"
  | "finance"
  | "sante"
  | "conso_discretionnaire"
  | "communication"
  | "industrie"
  | "conso_base"
  | "energie"
  | "materiaux"
  | "services_publics"
  | "immobilier";

export type Currency = "EUR" | "USD" | "GBP" | "CHF" | "JPY" | "EM" | "AUTRE";

export interface InstrumentMeta {
  label: string; // full name
  kind: "action" | "etf" | "etc" | "crypto" | "obligation";
  assetClass: AssetClass;
  /** Annualised volatility estimate (fraction, e.g. 0.16 = 16 %). */
  volatility: number;
  peaEligible: boolean;
  regions?: Partial<Record<Region, number>>; // weights summing to ~1
  sectors?: Partial<Record<Sector, number>>;
  currencies: Partial<Record<Currency, number>>; // economic exposure
  /** Largest underlying companies for ETFs (weight in the fund). */
  topHoldings?: { name: string; weight: number }[];
}

export const REGION_LABELS: Record<Region, string> = {
  amerique_nord: "Amérique du Nord",
  europe: "Europe",
  japon: "Japon",
  pacifique: "Pacifique hors Japon",
  emergents: "Pays émergents",
};

export const SECTOR_LABELS: Record<Sector, string> = {
  technologie: "Technologie",
  finance: "Finance",
  sante: "Santé",
  conso_discretionnaire: "Conso. discrétionnaire",
  communication: "Communication",
  industrie: "Industrie",
  conso_base: "Conso. de base",
  energie: "Énergie",
  materiaux: "Matériaux",
  services_publics: "Services publics",
  immobilier: "Immobilier",
};

export const CURRENCY_LABELS: Record<Currency, string> = {
  EUR: "Euro",
  USD: "Dollar US",
  GBP: "Livre sterling",
  CHF: "Franc suisse",
  JPY: "Yen",
  EM: "Devises émergentes",
  AUTRE: "Autres",
};

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  actions: "Actions",
  fonds_euros: "Fonds euros",
  liquidites: "Liquidités",
  or: "Or",
  crypto: "Crypto",
};

// Approximate MSCI ACWI breakdown: the "whole world" reference portfolio
// used to compare the user's equity allocation against.
export const ACWI_REGIONS: Record<Region, number> = {
  amerique_nord: 0.67,
  europe: 0.15,
  japon: 0.05,
  pacifique: 0.03,
  emergents: 0.1,
};

export const ACWI_SECTORS: Record<Sector, number> = {
  technologie: 0.265,
  finance: 0.17,
  industrie: 0.11,
  conso_discretionnaire: 0.11,
  sante: 0.09,
  communication: 0.085,
  conso_base: 0.055,
  energie: 0.035,
  materiaux: 0.035,
  services_publics: 0.025,
  immobilier: 0.02,
};

const SP500_SECTORS: InstrumentMeta["sectors"] = {
  technologie: 0.33,
  finance: 0.13,
  conso_discretionnaire: 0.105,
  communication: 0.1,
  sante: 0.09,
  industrie: 0.08,
  conso_base: 0.05,
  energie: 0.03,
  services_publics: 0.025,
  immobilier: 0.02,
  materiaux: 0.02,
};

const SP500_TOP: InstrumentMeta["topHoldings"] = [
  { name: "NVIDIA", weight: 0.075 },
  { name: "Microsoft", weight: 0.065 },
  { name: "Apple", weight: 0.065 },
  { name: "Amazon", weight: 0.04 },
  { name: "Alphabet", weight: 0.038 },
  { name: "Meta", weight: 0.03 },
  { name: "Broadcom", weight: 0.025 },
  { name: "Tesla", weight: 0.02 },
];

export const INSTRUMENTS: Record<string, InstrumentMeta> = {
  // ---- Actions en direct ----
  US8740541094: {
    label: "Take-Two Interactive",
    kind: "action",
    assetClass: "actions",
    volatility: 0.3,
    peaEligible: false,
    regions: { amerique_nord: 1 },
    sectors: { communication: 1 },
    currencies: { USD: 1 },
  },
  US5949181045: {
    label: "Microsoft",
    kind: "action",
    assetClass: "actions",
    volatility: 0.25,
    peaEligible: false,
    regions: { amerique_nord: 1 },
    sectors: { technologie: 1 },
    currencies: { USD: 1 },
  },
  US67066G1040: {
    label: "NVIDIA",
    kind: "action",
    assetClass: "actions",
    volatility: 0.5,
    peaEligible: false,
    regions: { amerique_nord: 1 },
    sectors: { technologie: 1 },
    currencies: { USD: 1 },
  },
  FR0000120271: {
    label: "TotalEnergies",
    kind: "action",
    assetClass: "actions",
    volatility: 0.22,
    peaEligible: true,
    regions: { europe: 1 },
    sectors: { energie: 1 },
    currencies: { EUR: 1 },
  },

  // ---- ETF / ETC ----
  FR0011550185: {
    label: "BNP Paribas Easy S&P 500 UCITS ETF",
    kind: "etf",
    assetClass: "actions",
    volatility: 0.16,
    peaEligible: true,
    regions: { amerique_nord: 1 },
    sectors: SP500_SECTORS,
    currencies: { USD: 1 },
    topHoldings: SP500_TOP,
  },
  FR0011550193: {
    label: "BNP Paribas Easy Stoxx Europe 600 UCITS ETF",
    kind: "etf",
    assetClass: "actions",
    volatility: 0.15,
    peaEligible: true,
    regions: { europe: 1 },
    sectors: {
      finance: 0.23,
      industrie: 0.19,
      sante: 0.14,
      conso_base: 0.09,
      conso_discretionnaire: 0.08,
      technologie: 0.07,
      materiaux: 0.05,
      energie: 0.05,
      services_publics: 0.04,
      communication: 0.04,
      immobilier: 0.02,
    },
    currencies: { EUR: 0.5, GBP: 0.23, CHF: 0.15, AUTRE: 0.12 },
    topHoldings: [
      { name: "ASML", weight: 0.023 },
      { name: "SAP", weight: 0.022 },
      { name: "Nestlé", weight: 0.017 },
      { name: "Roche", weight: 0.016 },
      { name: "Novartis", weight: 0.016 },
      { name: "AstraZeneca", weight: 0.016 },
      { name: "HSBC", weight: 0.016 },
      { name: "Shell", weight: 0.015 },
    ],
  },
  FR001400U5Q4: {
    label: "ETF PEA MSCI Emerging Markets",
    kind: "etf",
    assetClass: "actions",
    volatility: 0.17,
    peaEligible: true,
    regions: { emergents: 1 },
    sectors: {
      technologie: 0.25,
      finance: 0.235,
      conso_discretionnaire: 0.13,
      communication: 0.09,
      industrie: 0.07,
      materiaux: 0.06,
      conso_base: 0.045,
      energie: 0.045,
      sante: 0.035,
      services_publics: 0.025,
      immobilier: 0.015,
    },
    currencies: { EM: 1 },
    topHoldings: [
      { name: "TSMC", weight: 0.1 },
      { name: "Tencent", weight: 0.05 },
      { name: "Samsung Electronics", weight: 0.03 },
      { name: "Alibaba", weight: 0.03 },
    ],
  },
  IE00B4ND3602: {
    label: "iShares Physical Gold ETC",
    kind: "etc",
    assetClass: "or",
    volatility: 0.15,
    peaEligible: false,
    currencies: { USD: 1 },
  },

  // ---- Crypto (no ISIN: keyed by name) ----
  "name:Bitcoin": {
    label: "Bitcoin",
    kind: "crypto",
    assetClass: "crypto",
    volatility: 0.6,
    peaEligible: false,
    currencies: { USD: 1 },
  },

  // ---- Bonds ----
  US67066GAG91: {
    label: "NVIDIA obligation avril 2040",
    kind: "obligation",
    assetClass: "liquidites",
    volatility: 0.08,
    peaEligible: false,
    currencies: { USD: 1 },
  },
};

// The emerging-markets PEA ETF as Trade Republic lists it (same exposure).
INSTRUMENTS.FR0013412020 = { ...INSTRUMENTS.FR001400U5Q4, label: "PEA MSCI Emerging Markets ESG" };

export function findInstrument(isin: string | null, name: string): InstrumentMeta | null {
  if (isin && INSTRUMENTS[isin]) return INSTRUMENTS[isin];
  return INSTRUMENTS[`name:${name}`] ?? null;
}
