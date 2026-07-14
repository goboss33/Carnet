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

/** Frais de déplacement déductibles (aller-retour) en centimes, pour une distance
    one-way en km et un forfait CHF/km (réglable — voir lib/settings). */
export const mileageCents = (km: number | null | undefined, rate: number) =>
  km ? Math.round(2 * km * rate * 100) : 0;
