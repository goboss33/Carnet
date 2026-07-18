"use client";

/* Upload de médias Studio depuis la fiche — liés d'office à la commande. */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";

export default function StudioUploader({ orderId }: { orderId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("orderId", orderId);
    for (const f of Array.from(files)) fd.append("files", f);
    try {
      const res = await fetch("/api/studio/upload", { method: "POST", body: fd });
      if (res.status === 413) throw new Error("Fichier trop lourd pour le proxy (client_max_body_size).");
      const raw = await res.text();
      let j: { error?: string; results?: { ok: boolean; error?: string }[] };
      try { j = JSON.parse(raw); } catch { throw new Error(`Réponse inattendue du proxy (statut ${res.status}).`); }
      if (!res.ok) throw new Error(j.error ?? "Échec de l'upload");
      const ko = (j.results ?? []).filter((r) => !r.ok);
      if (ko.length) toast.error(`${ko.length} fichier(s) refusé(s) : ${ko[0].error ?? ""}`);
      else toast.success(`${(j.results ?? []).length} média(s) ajouté(s) à la commande.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'upload.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="inline-flex h-20 w-14 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 disabled:opacity-50"
        title="Ajouter photos ou clips — compressés automatiquement, liés à cette commande"
      >
        <Upload className="size-4" />
        <span className="text-[10px] font-medium">{busy ? "…" : "Ajouter"}</span>
      </button>
      <input ref={input} type="file" accept="video/*,image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
    </>
  );
}
