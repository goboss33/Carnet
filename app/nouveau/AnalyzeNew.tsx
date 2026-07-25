"use client";

/* « Nouvelle fiche » express : dépose une capture de l'échange (e-mail,
   WhatsApp…) — l'IA crée le contact (dédupliqué par tél/e-mail) et la fiche
   (mode standard ou Mode ligne selon le projet), puis redirige dessus. */

import { useRef, useState } from "react";
import { Sparkles, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { createLeadFromImage } from "@/app/actions";

export default function AnalyzeNew() {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  const onFile = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    setPending(true);
    try {
      const r = await createLeadFromImage(fd); // succès = redirection serveur
      if (r?.error) { toast.error(r.error); setPending(false); }
    } catch {
      // NEXT_REDIRECT : la navigation est en cours — on laisse l'état « analyse » affiché.
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => input.current?.click()}
      className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-dashed border-(--color-brand) bg-(--color-brand-soft)/40 px-4 py-3.5 text-left transition hover:bg-(--color-brand-soft)"
    >
      {pending ? (
        <Sparkles className="size-5 shrink-0 animate-pulse text-(--color-brand)" />
      ) : (
        <ImagePlus className="size-5 shrink-0 text-(--color-brand)" />
      )}
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-zinc-800">
          {pending ? "Analyse de l'échange…" : "Analyser un échange"}
        </span>
        <span className="block text-[12px] text-zinc-500">
          {pending
            ? "Contact et fiche en cours de création — un instant."
            : "Dépose une capture (e-mail, WhatsApp…) : contact + fiche créés automatiquement, en Mode ligne si le projet le demande."}
        </span>
      </span>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files)} />
    </button>
  );
}
