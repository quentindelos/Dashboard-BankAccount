// Browser side of the Trade Republic import: sends the "Exportation des
// transactions" file to the server, which rebuilds the PEA, CTO and crypto
// history. Shared by the Réglages card and the drop zone.

export interface TrImportResult {
  transactions: number;
  accounts: { account: string; from: string; days: number; value: number; positions: number }[];
  unpriced: string[];
}

export function isTrExportFile(file: File): boolean {
  return /\.(csv|xlsx)$/i.test(file.name);
}

export async function importTrExport(file: File): Promise<TrImportResult> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/import/trade-republic/history", { method: "POST", body }).catch(() => null);
  if (!res) throw new Error("Impossible d'envoyer le fichier.");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'import.");
  return data as TrImportResult;
}
