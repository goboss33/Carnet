"use client";

/* Photos d'inspiration — vignettes, ajout (upload), suppression.
   Actions directes (pas de <form> : le composant vit dans le form de la fiche). */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { uploadInspirations, removeInspiration } from "@/app/actions";
import MediaViewer from "@/app/components/MediaViewer";

export default function InspirationManager({ orderId, photos }: { orderId: string; photos: string[] }) {
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
                confirmRel === src ? "bg-red-600" : "bg-zinc-500/90 opacity-0 hover:bg-red-600 group-hover:opacity-100"
              }`}
              title={confirmRel === src ? "Clique à nouveau pour confirmer" : "Supprimer"}
            >
              <X className="size-3" />
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
