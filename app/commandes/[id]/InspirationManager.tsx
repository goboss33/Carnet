"use client";

/* Photos d'inspiration — vignettes, ajout (upload), suppression.
   Actions directes (pas de <form> : le composant vit dans le form de la fiche). */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X, FileSignature } from "lucide-react";
import { toast } from "sonner";
import { uploadInspirations, removeInspiration, toggleQuotePhoto } from "@/app/actions";
import MediaViewer from "@/app/components/MediaViewer";

export default function InspirationManager({ orderId, photos, quotePhotos = [] }: { orderId: string; photos: string[]; quotePhotos?: string[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [confirmRel, setConfirmRel] = useState<string | null>(null);

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    start(async () => {
      const r = await uploadInspirations(orderId, fd);
      if (r.error) toast.error(r.error);
      else toast.success(`${r.added} photo${(r.added ?? 0) > 1 ? "s" : ""} ajoutée${(r.added ?? 0) > 1 ? "s" : ""}.`);
      if (input.current) input.current.value = "";
      router.refresh();
    });
  };

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Photos d’inspiration</p>
      <div className="flex flex-wrap gap-2">
        {photos.map((src, i) => (
          <span key={src} className="group relative">
            <MediaViewer
              src={`/api/receipts/${src}`}
              kind="image"
              title={`Inspiration ${i + 1}`}
              className="block h-24 w-24 overflow-hidden rounded-lg border border-zinc-200 hover:border-zinc-400"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/receipts/${src}`} alt={`Inspiration ${i + 1}`} className="h-full w-full object-cover" />
            </MediaViewer>
            <button
              type="button"
              aria-label="Supprimer cette photo"
              onClick={() => {
                if (confirmRel === src) {
                  setConfirmRel(null);
                  start(async () => {
                    const r = await removeInspiration(orderId, src);
                    if (r.error) toast.error(r.error);
                    else toast.success("Photo supprimée.");
                    router.refresh();
                  });
                } else {
                  setConfirmRel(src);
                  setTimeout(() => setConfirmRel((c) => (c === src ? null : c)), 2500);
                }
              }}
              className={`absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full text-white shadow transition-colors ${
                confirmRel === src ? "bg-red-600" : "bg-zinc-500/90 hover:bg-red-600 sm:opacity-0 sm:group-hover:opacity-100"
              }`}
              title={confirmRel === src ? "Clique à nouveau pour confirmer" : "Supprimer"}
            >
              <X className="size-3" />
            </button>
            {/* Coche « sur le devis » — section Visuels du concept (max 4) */}
            <button
              type="button"
              aria-label="Afficher sur le devis"
              onClick={() =>
                start(async () => {
                  const on = !quotePhotos.includes(src);
                  const r = await toggleQuotePhoto(orderId, src, on);
                  if (r.error) toast.error(r.error);
                  else toast.success(on ? "Ajoutée aux visuels du devis." : "Retirée du devis.");
                  router.refresh();
                })
              }
              className={`absolute bottom-1 left-1 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold shadow transition-colors ${
                quotePhotos.includes(src)
                  ? "bg-(--color-brand) text-white"
                  : "bg-white/90 text-zinc-500 hover:text-zinc-800 sm:opacity-0 sm:group-hover:opacity-100"
              }`}
              title={quotePhotos.includes(src) ? "Sur le devis — clique pour retirer" : "Afficher sur le devis (Visuels du concept)"}
            >
              <FileSignature className="size-3" />
              devis
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={pending}
          className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 text-zinc-400 transition-colors hover:border-zinc-400 hover:text-zinc-600 disabled:opacity-50"
        >
          <ImagePlus className="size-5" />
          <span className="text-[11px] font-medium">{pending ? "Envoi…" : "Ajouter"}</span>
        </button>
        <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </div>
    </div>
  );
}
