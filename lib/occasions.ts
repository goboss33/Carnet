/* Rendu visuel partagé des occasions (icône + libellé court) — utilisé par la
   fiche commande (pastille éditable) et l'historique (affichage). Aligné sur la
   liste standard OCCASIONS de lib/order-options. */

import { Cake, Heart, Baby, Briefcase, PartyPopper, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "Anniversaire d'enfant": PartyPopper,
  "Anniversaire d'adulte": Cake,
  Mariage: Heart,
  "Baby shower": Baby,
  "Événement d'entreprise": Briefcase,
  "Autre occasion": Sparkles,
};

const SHORT: Record<string, string> = {
  "Anniversaire d'enfant": "Anniv. enfant",
  "Anniversaire d'adulte": "Anniv. adulte",
  "Événement d'entreprise": "Entreprise",
  "Autre occasion": "Autre",
};

export const occasionIcon = (occ: string): LucideIcon => ICONS[occ] ?? Sparkles;
export const occasionShort = (occ: string): string => SHORT[occ] ?? occ;
