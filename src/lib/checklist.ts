// What the user should update or fill in so the app (and its assistant) stay
// accurate: stale balances, a late Trade Republic import, missing budget
// lines, assumptions never checked. Recomputed on each visit, so an item goes
// away as soon as the data is there: it works as a standing reminder.
import { prisma } from "@/lib/db";
import { loadPortfolio, type PortfolioData } from "@/lib/portfolio";
import { computeGains } from "@/lib/gains";
import { analyzePortfolio } from "@/lib/analysis";
import { getSettings, type AppSettings } from "@/lib/settings";
import { PHYSICAL_TYPES, isTradeRepublic } from "@/lib/accountTypes";
import { isIncome, isSavings } from "@/lib/expenses";
import { loadProjectionSettings } from "@/lib/projectionSettings";
import { loadAssistantSettings } from "@/lib/assistantSettings";
import { loadProfile } from "@/lib/profile";

/** late: data out of date · missing: never filled in · tip: would improve the advice. */
export type ChecklistLevel = "late" | "missing" | "tip";

export interface ChecklistItem {
  id: string;
  level: ChecklistLevel;
  title: string;
  detail: string;
  href: string;
  action: string;
}

/** A Trade Republic export older than this is a reminder. */
const TR_MAX_DAYS = 14;
/** A manual balance (livret, assurance vie...) older than this is a reminder. */
const MANUAL_MAX_DAYS = 31;

const DAY = 86_400_000;
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "de Livret Bleu" but "d'Assurance Vie". */
const de = (name: string) => (/^[aeiouyhàâéèêëîïôöùûü]/i.test(name) ? `d'${name}` : `de ${name}`);

function age(date: Date, now: Date): string {
  const days = Math.floor((now.getTime() - date.getTime()) / DAY);
  return `dernier relevé le ${dateFormat.format(date)}, il y a ${days} jours`;
}

const LEVEL_ORDER: Record<ChecklistLevel, number> = { late: 0, missing: 1, tip: 2 };

/** Pages that already load the portfolio or settings pass them here, so they
 * aren't read and computed a second time for the same request. */
export interface ChecklistPreload {
  data?: Promise<PortfolioData>;
  settings?: Promise<AppSettings>;
}

export async function buildChecklist(now = new Date(), preload: ChecklistPreload = {}): Promise<ChecklistItem[]> {
  const [accounts, data, settings, expenses, projection, assistant, memories, cushionAccounts, identity] = await Promise.all([
    prisma.account.findMany({
      where: { archived: false },
      select: { id: true, name: true, type: true, details: true, institution: true, entries: { select: { date: true }, orderBy: { date: "desc" }, take: 1 } },
      orderBy: { createdAt: "asc" },
    }),
    preload.data ?? loadPortfolio(),
    preload.settings ?? getSettings(),
    prisma.recurringExpense.findMany({ where: { active: true } }),
    prisma.setting.findUnique({ where: { key: "projection" } }).then((row) => (row ? loadProjectionSettings() : null)),
    loadAssistantSettings(),
    prisma.assistantMemory.count(),
    prisma.account.count({ where: { archived: false, emergencyFund: true } }),
    loadProfile(),
  ]);
  const items: ChecklistItem[] = [];
  if (accounts.length === 0) return items;

  // ---- Balances
  const tr = accounts.filter((a) => isTradeRepublic(a.institution));
  const trLast = tr
    .map((a) => a.entries[0]?.date)
    .filter((d): d is Date => Boolean(d))
    .sort((x, y) => y.getTime() - x.getTime())[0];
  if (tr.length > 0 && (!trLast || now.getTime() - trLast.getTime() > TR_MAX_DAYS * DAY)) {
    items.push({
      id: "tr-import",
      level: trLast ? "late" : "missing",
      title: "Importe ton export Trade Republic",
      detail: trLast
        ? `${tr.map((a) => a.name).join(", ")} : ${age(trLast, now)}. Dans l'app Trade Republic : Relevés > Exportation des transactions.`
        : "Aucun historique importé pour tes comptes Trade Republic.",
      href: "/settings",
      action: "Importer",
    });
  }
  for (const a of accounts) {
    if (isTradeRepublic(a.institution)) continue;
    // Gold and vehicles are valued by the app from their description.
    if (PHYSICAL_TYPES.has(a.type)) {
      if (!a.details) {
        items.push({
          id: `describe-${a.id}`,
          level: "missing",
          title: a.type === "VEHICULE" ? `Décris ton véhicule ${a.name}` : `Décris ton or (${a.name})`,
          detail: a.type === "VEHICULE" ? "Marque, modèle, année et kilométrage : l'IA estime sa cote à partir des annonces." : "Pièces ou lingots et poids : la valeur suit le cours de l'or chaque jour.",
          href: `/accounts/${a.id}`,
          action: "Décrire",
        });
      }
      continue;
    }
    const last = a.entries[0]?.date;
    if (!last) {
      items.push({
        id: `entry-${a.id}`,
        level: "missing",
        title: `Saisis la valeur ${de(a.name)}`,
        detail: "Aucun relevé pour ce compte : il compte pour 0 € dans ton patrimoine.",
        href: `/accounts/${a.id}`,
        action: "Saisir",
      });
    } else if (now.getTime() - last.getTime() > MANUAL_MAX_DAYS * DAY) {
      items.push({
        id: `entry-${a.id}`,
        level: "late",
        title: `Mets à jour le solde ${de(a.name)}`,
        detail: `${age(last, now)}.`,
        href: `/accounts/${a.id}`,
        action: "Mettre à jour",
      });
    }
  }

  // ---- Amounts paid in (needed for gains and performance)
  for (const m of computeGains(data).missing) {
    items.push({
      id: `contrib-${m.id}`,
      level: "missing",
      title: `Indique le total versé sur ${m.name}`,
      detail: "Sans lui, la plus-value et la performance de ce compte ne sont pas calculées.",
      href: `/accounts/${m.id}`,
      action: "Renseigner",
    });
  }

  // ---- Budget and cushion
  if (!expenses.some(isIncome)) {
    items.push({
      id: "budget-income",
      level: "missing",
      title: "Ajoute tes revenus",
      detail: "Salaire, aides... pour calculer ton taux d'épargne et ce qu'il te reste chaque mois.",
      href: "/expenses",
      action: "Ajouter",
    });
  }
  if (!expenses.some((e) => !isIncome(e) && !isSavings(e))) {
    items.push({
      id: "budget-charges",
      level: "missing",
      title: "Ajoute tes charges",
      detail: "Loyer, abonnements, courses... pour dimensionner ton matelas de sécurité.",
      href: "/expenses",
      action: "Ajouter",
    });
  }
  if (cushionAccounts === 0) {
    items.push({
      id: "cushion",
      level: "missing",
      title: "Choisis ton matelas de sécurité",
      detail: "Le ou les livrets qui servent d'épargne de précaution.",
      href: "/expenses",
      action: "Choisir",
    });
  }

  // ---- Analysis
  const unclassified = analyzePortfolio(data.holdings, data.otherAssets, settings).unclassified;
  if (unclassified.length > 0) {
    items.push({
      id: "unclassified",
      level: "tip",
      title: "Lignes non reconnues par l'analyse",
      detail: `${unclassified.join(", ")} : à ajouter au référentiel des instruments pour la répartition et le risque.`,
      href: "/analysis",
      action: "Voir",
    });
  }

  // ---- Assumptions and profile, for the projection and the assistant
  if (!projection) {
    items.push({
      id: "projection",
      level: "tip",
      title: "Vérifie tes hypothèses de projection",
      detail: "Versements, rendements et salaire après ton diplôme : enregistre-les pour une projection fidèle.",
      href: "/projection",
      action: "Vérifier",
    });
  }
  if (!identity.birthDate || !identity.family || !identity.job) {
    items.push({
      id: "profile",
      level: "tip",
      title: "Complète ton profil",
      detail: "Âge, situation familiale et professionnelle : le conseiller adapte ses conseils (Livret Jeune, PER, foyer fiscal...).",
      href: "/profile",
      action: "Compléter",
    });
  }
  if (assistant.tmi === null) {
    items.push({
      id: "assistant-tmi",
      level: "tip",
      title: "Indique ta tranche d'imposition",
      detail: "Le conseiller en a besoin pour chiffrer précisément les montages fiscaux (PER, barème ou flat tax...).",
      href: "/assistant",
      action: "Renseigner",
    });
  }
  if (memories === 0) {
    items.push({
      id: "assistant-memory",
      level: "tip",
      title: "Présente ta situation au conseiller",
      detail: "Situation familiale, épargne salariale Thales et abondement, projets : il retient tout pour ses prochains conseils.",
      href: "/assistant",
      action: "Discuter",
    });
  }

  return items.sort((x, y) => LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level]);
}

/** Items the user should act on (tips excluded), shown as a count in the menu. */
export function dueCount(items: ChecklistItem[]): number {
  return items.filter((i) => i.level !== "tip").length;
}
