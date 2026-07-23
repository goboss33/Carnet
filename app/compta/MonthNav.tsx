"use client";

/* Navigation de mois : flèches + sélecteur natif qui navigue AU CHANGEMENT
   (fini le bouton « OK »). Le libellé affiché est le mois en toutes lettres ;
   l'input natif est superposé, invisible, pour ouvrir le sélecteur du système. */

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";

export default function MonthNav({ month, prev, next, label }: { month: string; prev: string; next: string; label: string }) {
  const router = useRouter();
  const go = (m: string) => router.push(`/compta?m=${m}`);
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-zinc-300 bg-white p-0.5">
      <button type="button" onClick={() => go(prev)} aria-label="Mois précédent" className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800">
        <ChevronLeft className="size-4" />
      </button>
      <span className="relative rounded-md transition-colors hover:bg-zinc-100" title="Cliquer pour choisir un mois précis">
        <span className="flex min-w-28 items-center justify-center gap-1 px-1.5 py-1 text-[13px] font-semibold capitalize text-zinc-800">
          {label} <ChevronDown className="size-3.5 text-zinc-400" />
        </span>
        <input
          type="month"
          value={month}
          onChange={(e) => e.target.value && go(e.target.value)}
          aria-label="Choisir le mois"
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </span>
      <button type="button" onClick={() => go(next)} aria-label="Mois suivant" className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
