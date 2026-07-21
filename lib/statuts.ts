import type { OrderStatus } from "@prisma/client";

export const STATUTS: { id: OrderStatus; label: string; hint: string; dot: string }[] = [
  { id: "LEAD", label: "Leads", hint: "premier contact", dot: "bg-sky-500" },
  { id: "DEVIS_ENVOYE", label: "Devis envoyé", hint: "en attente de réponse", dot: "bg-amber-500" },
  { id: "ACOMPTE_RECU", label: "Confirmé", hint: "acompte reçu · date bloquée", dot: "bg-violet-500" },
  { id: "EN_PRODUCTION", label: "En production", hint: "cette semaine", dot: "bg-orange-500" },
  { id: "LIVRE", label: "Livré", hint: "à relancer pour avis", dot: "bg-emerald-500" },
];

export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  LEAD: "DEVIS_ENVOYE",
  DEVIS_ENVOYE: "ACOMPTE_RECU",
  ACOMPTE_RECU: "EN_PRODUCTION",
  EN_PRODUCTION: "LIVRE",
};

export const SOURCES = [
  { id: "CONFIGURATEUR", label: "Configurateur" },
  { id: "WHATSAPP", label: "WhatsApp" },
  { id: "INSTAGRAM", label: "Instagram" },
  { id: "TELEPHONE", label: "Téléphone" },
  { id: "AUTRE", label: "Autre" },
] as const;

export const fmtCHF = (n?: number | null) => (n == null ? "—" : `CHF ${n}`);
export const fmtDate = (d?: Date | null) =>
  d ? new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "short", year: "numeric" }).format(d) : "—";
