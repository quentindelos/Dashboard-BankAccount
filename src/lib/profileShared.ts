// The user's personal situation (Mon compte page), sent to the assistant with
// every question. Shared by the server and the profile form (no server imports).
import { z } from "zod";

export const FAMILY_STATUS = {
  single: "Célibataire",
  couple: "En couple (union libre)",
  pacs: "Pacsé(e)",
  married: "Marié(e)",
  separated: "Divorcé(e) ou séparé(e)",
  widowed: "Veuf ou veuve",
} as const;

export const JOB_STATUS = {
  student: "Étudiant(e)",
  apprentice: "Alternant(e) ou apprenti(e)",
  employee: "Salarié(e) en CDI",
  fixedTerm: "Salarié(e) en CDD ou intérim",
  civilServant: "Fonctionnaire",
  selfEmployed: "Indépendant(e) ou freelance",
  businessOwner: "Chef d'entreprise",
  jobSeeker: "En recherche d'emploi",
  retired: "Retraité(e)",
} as const;

export const HOUSING_STATUS = {
  parents: "Hébergé(e) chez mes parents",
  tenant: "Locataire",
  owner: "Propriétaire, sans crédit",
  ownerMortgage: "Propriétaire, crédit immobilier en cours",
  free: "Logé(e) gratuitement",
} as const;

export const TAX_HOUSEHOLD = {
  parents: "Rattaché(e) au foyer fiscal de mes parents",
  own: "Ma propre déclaration de revenus",
  joint: "Déclaration commune (mariage ou PACS)",
} as const;

const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

function isPastDate(v: string): boolean {
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && t <= Date.now() && v >= "1900-01-01";
}

/** What the profile form sends (the photo has its own upload route). */
export const userProfileSchema = z.object({
  firstName: z.string().trim().max(50, "Prénom : 50 caractères maximum"),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date de naissance invalide")
    .refine(isPastDate, "Date de naissance invalide")
    .nullable(),
  family: z.enum(keys(FAMILY_STATUS)).nullable(),
  children: z.number().int().min(0).max(20).nullable(),
  job: z.enum(keys(JOB_STATUS)).nullable(),
  occupation: z.string().trim().max(120, "Métier : 120 caractères maximum"),
  housing: z.enum(keys(HOUSING_STATUS)).nullable(),
  city: z.string().trim().max(80, "Ville : 80 caractères maximum"),
  taxHousehold: z.enum(keys(TAX_HOUSEHOLD)).nullable(),
});

export type UserProfileInput = z.infer<typeof userProfileSchema>;

export interface UserProfile extends UserProfileInput {
  /** File name of the profile photo in data/avatar, null when none. */
  photo: string | null;
}

export const EMPTY_PROFILE: UserProfile = {
  firstName: "",
  birthDate: null,
  family: null,
  children: null,
  job: null,
  occupation: "",
  housing: null,
  city: "",
  taxHousehold: null,
  photo: null,
};

/** Age in whole years on `now`, null without a birth date. */
export function ageFrom(birthDate: string | null, now = new Date()): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age >= 0 ? age : null;
}

/** The URL changes with the file, so the browser can cache each photo for good. */
export const profilePhotoUrl = (photo: string) => `/api/account/photo?v=${encodeURIComponent(photo)}`;

/** Profile lines for the assistant's snapshot (only what is filled in). */
export function profileLines(p: UserProfile, now = new Date()): string[] {
  const lines: string[] = [];
  const age = ageFrom(p.birthDate, now);
  if (p.firstName) lines.push(`Prénom : ${p.firstName}`);
  if (age !== null && p.birthDate) {
    const born = new Date(`${p.birthDate}T00:00:00Z`).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "UTC" });
    lines.push(`Âge : ${age} ans (né(e) le ${born})`);
  }
  if (p.family) lines.push(`Situation familiale : ${FAMILY_STATUS[p.family]}`);
  if (p.children !== null) lines.push(`Enfants à charge : ${p.children === 0 ? "aucun" : p.children}`);
  if (p.job) lines.push(`Situation professionnelle : ${JOB_STATUS[p.job]}${p.occupation ? `, ${p.occupation}` : ""}`);
  else if (p.occupation) lines.push(`Métier : ${p.occupation}`);
  if (p.housing) lines.push(`Logement : ${HOUSING_STATUS[p.housing]}`);
  if (p.city) lines.push(`Lieu de vie : ${p.city}`);
  if (p.taxHousehold) lines.push(`Foyer fiscal : ${TAX_HOUSEHOLD[p.taxHousehold]}`);
  return lines;
}
