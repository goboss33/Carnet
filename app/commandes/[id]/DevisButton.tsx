"use client";

/* ---------------------------------------------------------------------------
   Bouton « Devis » — la validité se choisit au moment de générer.

   Une validité figée à 90 jours n'a pas de sens pour un mariage dans trois
   semaines : la date limite est un levier de décision, pas une mention
   administrative. Un devis qui expire après l'événement ne pousse personne à
   répondre.

   La durée des Réglages reste le défaut ; le menu ne fait que proposer les
   cas courants. Aucune donnée n'est enregistrée — le choix ne vaut que pour
   ce PDF-là, ce qui permet de regénérer autrement sans rien défaire.
--------------------------------------------------------------------------- */

import { useState } from "react";
import { FileSignature, ChevronDown } from "lucide-react";
import { cn } from "@/lib/ui";

const DUREES = [7, 14, 30, 90];

/** Date limite en clair : « valable jusqu'au 12.08 » parle plus que « 14 jours ». */
const echeance = (jours: number) =>
  new Date(Date.now() + jours * 86400000).toLocaleDateString("fr-CH", {
    day: "2-digit",
    month: "2-digit",
  });

export default function DevisButton({ orderId, defaultDays }: { orderId: string; defaultDays: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-[13px] font-medium text-zinc-700 transition hover:bg-zinc-50"
      >
        <FileSignature className="size-3.5" /> Devis
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
            <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Validité de l&apos;offre
            </p>
            {DUREES.map((j) => (
              <a
                key={j}
                href={`/api/commandes/${orderId}/devis?jours=${j}`}
                target="_blank"
                rel="noopener"
                onClick={() => setOpen(false)}
                className="flex items-baseline justify-between gap-3 px-3 py-2 hover:bg-zinc-50"
              >
                <span className="text-[13px] font-medium text-zinc-800">
                  {j} jours
                  {j === defaultDays && <span className="ml-1.5 text-[11px] font-normal text-zinc-400">défaut</span>}
                </span>
                <span className="shrink-0 text-[11px] text-zinc-400">jusqu&apos;au {echeance(j)}</span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
