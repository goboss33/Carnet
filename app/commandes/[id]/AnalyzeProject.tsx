"use client";

/* « Analyser un échange » — upload d'une capture (mail/WhatsApp), l'IA propose
   le mode adapté (standard ou Mode ligne) et pré-remplit la fiche sans jamais
   écraser ce qui est déjà saisi. */

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { analyzeProjectImage } from "@/app/actions";
import { cn } from "@/lib/ui";

export default function AnalyzeProject({ orderId }: { orderId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();

  const onFile = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    start(async () => {
      const r = await analyzeProjectImage(orderId, fd);
      if (r.error) toast.error(r.error);
      else toast.success(r.summary ?? "Fiche mise à jour.");
      if (input.current) input.current.value = "";
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        title="Envoie une capture de l'échange (e-mail, WhatsApp…) — l'IA choisit le mode adapté et pré-remplit la fiche sans écraser l'existant."
        className={cn(
          "flex items-center gap-1.5 text-[12px] font-medium text-zinc-400 transition hover:text-(--color-brand)",
          pending && "animate-pulse text-(--color-brand)"
        )}
      >
        <Sparkles className="size-3.5" />
        {pending ? "Analyse…" : "Analyser un échange"}
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files)} />
    </>
  );
}
