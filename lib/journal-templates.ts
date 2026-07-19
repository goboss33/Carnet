/* Constantes des templates du Journal — client-safe (aucun import serveur).
   Importable depuis le wizard (composant client) comme depuis lib/journal. */
import type { JournalType } from "@prisma/client";

export type TemplateKey = "RECIT" | "GALERIE" | "GUIDE" | "ANNONCE" | "SELECTION";

/* Chaque template fige type + format + intention rédactionnelle. */
export const TEMPLATE_META: Record<TemplateKey, {
  type: JournalType; format: "ARTICLE" | "DIAPORAMA"; needsOrder: boolean; label: string;
}> = {
  RECIT:     { type: "CREATION", format: "ARTICLE",   needsOrder: true,  label: "Récit d'une création" },
  GALERIE:   { type: "CREATION", format: "DIAPORAMA", needsOrder: true,  label: "Galerie" },
  GUIDE:     { type: "ARTICLE",  format: "ARTICLE",   needsOrder: false, label: "Guide conseil" },
  ANNONCE:   { type: "ARTICLE",  format: "ARTICLE",   needsOrder: false, label: "Annonce" },
  SELECTION: { type: "ARTICLE",  format: "DIAPORAMA", needsOrder: false, label: "Sélection d'idées" },
};

/** Déduit le template d'une entrée historique (avant le champ template). */
export function inferTemplate(type: string, format: string): TemplateKey {
  if (type === "CREATION") return format === "DIAPORAMA" ? "GALERIE" : "RECIT";
  return format === "DIAPORAMA" ? "SELECTION" : "GUIDE";
}
