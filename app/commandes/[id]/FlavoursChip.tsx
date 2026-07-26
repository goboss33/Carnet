"use client";

/* « Carte des saveurs » — insère le lien dans le brouillon de réponse plutôt
   que d'envoyer une image en pièce jointe : la page reste à jour, s'affiche en
   aperçu dans WhatsApp et Instagram, et ramène la cliente au configurateur.
   Copie aussi le lien seul, pour les cas où Annie écrit à la main. */

import { useState } from "react";
import { Croissant, Check } from "lucide-react";
import { cn } from "@/lib/ui";

const PHRASE = (url: string) => `Voici toutes mes saveurs : ${url}`;

export default function FlavoursChip({ url }: { url: string }) {
  const [done, setDone] = useState<"insert" | "copy" | null>(null);
  if (!url) return null;

  const flash = (what: "insert" | "copy") => {
    setDone(what);
    setTimeout(() => setDone(null), 1600);
  };

  const insert = () => {
    // Le champ de consigne de l'assistant, dans le même formulaire.
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="message"]');
    if (!ta) return;
    const base = ta.value.trim();
    ta.value = base ? `${base}\n${PHRASE(url)}` : PHRASE(url);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.focus();
    flash("insert");
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={insert}
        title="Ajouter le lien de la carte des saveurs à la consigne"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
          done === "insert" ? "border-emerald-600/30 bg-emerald-50 text-emerald-700" : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
        )}
      >
        {done === "insert" ? <Check className="size-3.5" /> : <Croissant className="size-3.5" />}
        {done === "insert" ? "Ajouté" : "Carte des saveurs"}
      </button>
      <button
        type="button"
        onClick={() => { void navigator.clipboard?.writeText(url); flash("copy"); }}
        title="Copier seulement le lien"
        className="rounded-lg px-1.5 py-1.5 text-[11px] font-medium text-zinc-400 transition hover:text-zinc-700"
      >
        {done === "copy" ? "copié" : "lien"}
      </button>
    </span>
  );
}
