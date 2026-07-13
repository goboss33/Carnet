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

/** Forfait kilométrique déductible (CHF/km) — réglable via env, à confirmer avec la fiduciaire. */
export const KM_RATE = Number(process.env.DEDUCT_KM_RATE ?? 0.7) || 0.7;

/** Frais de déplacement déductibles (aller-retour) en centimes, pour une distance one-way en km. */
export const mileageCents = (km?: number | null) => (km ? Math.round(2 * km * KM_RATE * 100) : 0);
