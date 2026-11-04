// Logo keys for instruments, companies and banks. A key is "<kind>/<id>" and is
// served by /api/logo/<kind>/<id>, which downloads the image once and caches it
// in data/logos (so it keeps working offline on the Raspberry Pi).
import { INSTRUMENTS } from "@/lib/instruments";

export type LogoKey = `${"isin" | "crypto" | "domain"}/${string}`;

export function logoUrl(key: LogoKey | null | undefined): string | null {
  return key ? `/api/logo/${key}` : null;
}

const CRYPTO_SYMBOLS: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
  ripple: "XRP",
  xrp: "XRP",
  cardano: "ADA",
};

/** Logo of a held instrument: by ISIN, or by symbol for crypto. */
export function instrumentLogo(isin: string | null | undefined, name: string): LogoKey | null {
  if (isin) return `isin/${isin.toUpperCase()}`;
  const symbol = CRYPTO_SYMBOLS[name.trim().toLowerCase()];
  return symbol ? `crypto/${symbol}` : null;
}

// Companies seen through ETFs (top holdings), by display name.
const COMPANY_ISINS: Record<string, string> = {
  NVIDIA: "US67066G1040",
  Microsoft: "US5949181045",
  Apple: "US0378331005",
  Amazon: "US0231351067",
  Alphabet: "US02079K3059",
  Meta: "US30303M1027",
  Broadcom: "US11135F1015",
  Tesla: "US88160R1014",
  ASML: "NL0010273215",
  SAP: "DE0007164600",
  Nestlé: "CH0038863350",
  Roche: "CH0012032048",
  Novartis: "CH0012005267",
  AstraZeneca: "GB0009895292",
  HSBC: "GB0005405286",
  Shell: "GB00BP6MXD84",
  TSMC: "US8740391003",
  Tencent: "KYG875721634",
  "Samsung Electronics": "US7960508882",
  Alibaba: "US01609W1027",
};

// Directly held instruments, by their label in the instrument reference.
const LABEL_ISINS: Record<string, string> = Object.fromEntries(
  Object.entries(INSTRUMENTS)
    .filter(([key]) => !key.startsWith("name:"))
    .map(([isin, meta]) => [meta.label, isin]),
);

export function companyLogo(name: string): LogoKey | null {
  const isin = LABEL_ISINS[name] ?? COMPANY_ISINS[name];
  return isin ? `isin/${isin}` : instrumentLogo(null, name);
}

// Banks and brokers, matched on a normalised institution name.
const INSTITUTION_DOMAINS: [RegExp, string][] = [
  [/traderepublic/, "traderepublic.com"],
  [/creditmutuel/, "creditmutuel.fr"],
  [/banquepostale/, "labanquepostale.fr"],
  [/boursorama|boursobank/, "boursobank.com"],
  [/fortuneo/, "fortuneo.fr"],
  [/creditagricole/, "credit-agricole.fr"],
  [/caissedepargne/, "caisse-epargne.fr"],
  [/banquepopulaire/, "banquepopulaire.fr"],
  [/societegenerale/, "societegenerale.fr"],
  [/^lcl$|creditlyonnais/, "lcl.fr"],
  [/bnp/, "mabanque.bnpparibas"],
  [/hellobank/, "hellobank.fr"],
  [/cic/, "cic.fr"],
  [/revolut/, "revolut.com"],
  [/n26/, "n26.com"],
  [/bourseDirect|boursedirect/, "boursedirect.fr"],
  [/degiro/, "degiro.fr"],
  [/interactivebrokers|ibkr/, "interactivebrokers.com"],
  [/linxea/, "linxea.com"],
  [/yomoni/, "yomoni.fr"],
  [/ramify/, "ramify.fr"],
  [/binance/, "binance.com"],
  [/coinbase/, "coinbase.com"],
  [/bitpanda/, "bitpanda.com"],
  [/kraken/, "kraken.com"],
  [/axa/, "axa.fr"],
  [/generali/, "generali.fr"],
  [/spirica/, "spirica.fr"],
];

export function institutionLogo(institution: string | null | undefined): LogoKey | null {
  if (!institution) return null;
  const n = institution
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const hit = INSTITUTION_DOMAINS.find(([re]) => re.test(n));
  return hit ? `domain/${hit[1]}` : null;
}
