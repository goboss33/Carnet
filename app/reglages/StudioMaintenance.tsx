"use client";

/* Entretien de la bibliothèque Contenu : purge des médias inutilisés.
   Déplacé ici depuis la barre d'outils de la bibliothèque (action rare). */

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/table-kit";
import { purgeStudioAssets } from "@/app/studio/actions";

export default function StudioMaintenance() {
  const router = useRouter();
  const { confirm, node } = useConfirm();
  return (
    <div className="rounded-lg border border-(--color-line) bg-zinc-50/60 p-3">
      {node}
      <Button
        type="button" size="sm" variant="outline"
        onClick={() => confirm({
          title: "Purger les médias inutilisés de plus de 6 mois",
          desc: "Les médias liés à une commande ou utilisés dans une page sont conservés.",
          confirmLabel: "Purger",
          action: async () => { const r = await purgeStudioAssets(); toast.success(`${r.purged ?? 0} média(s) purgé(s).`); router.refresh(); },
        })}
      >
        <Trash2 /> Purger les médias inutilisés (6 mois+)
      </Button>
      <p className="mt-1.5 text-[11px] text-zinc-400">Supprime les photos et vidéos jamais liées à une commande ni utilisées dans une page, et plus vieilles que 6 mois.</p>
    </div>
  );
}
