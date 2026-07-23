export const chf = (cents: number) =>
  new Intl.NumberFormat("fr-CH", { style: "currency", currency: "CHF" }).format(cents / 100);

export const CATEGORIES: { id: string; label: string; emoji: string }[] = [
  { id: "MATIERES_PREMIERES", label: "Matières premières", emoji: "🥚" },
  { id: "EMBALLAGE", label: "Emballage", emoji: "🎀" },
  { id: "MATERIEL", label: "Matériel", emoji: "🍳" },
  { id: "DEPLACEMENT", label: "Déplacement", emoji: "🚗" },
  { id: "MARKETING", label: "Marketing", emoji: "📣" },
  { id: "AUTRE", label: "Autre", emoji: "📎" },
];

export const catLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

/** Teinte de pastille par catégorie (même langage que les statuts). */
export const CAT_TONE: Record<string, string> = {
  MATIERES_PREMIERES: "bg-amber-50 text-amber-700",
  EMBALLAGE: "bg-violet-50 text-violet-700",
  MATERIEL: "bg-sky-50 text-sky-700",
  DEPLACEMENT: "bg-orange-50 text-orange-700",
  MARKETING: "bg-emerald-50 text-emerald-700",
  AUTRE: "bg-zinc-100 text-zinc-600",
};

/** Couleur de mini-barre par catégorie. */
export const CAT_BAR: Record<string, string> = {
  MATIERES_PREMIERES: "bg-amber-500",
  EMBALLAGE: "bg-violet-500",
  MATERIEL: "bg-sky-500",
  DEPLACEMENT: "bg-orange-500",
  MARKETING: "bg-emerald-500",
  AUTRE: "bg-zinc-400",
};

/** Frais de déplacement déductibles (aller-retour) en centimes, pour une distance
    one-way en km et un forfait CHF/km (réglable — voir lib/settings). */
export const mileageCents = (km: number | null | undefined, rate: number) =>
  km ? Math.round(2 * km * rate * 100) : 0;
