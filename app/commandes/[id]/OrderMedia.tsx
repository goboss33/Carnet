"use client";

/* Miniatures des médias liés à une commande, avec retouche IA au survol
   (ouvre le module PhotoEditor). Rendu par StudioMedia (serveur). */

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Wand2 } from "lucide-react";
import PhotoEditor from "@/app/studio/PhotoEditor";

type Item = { id: string; kind: "VIDEO" | "PHOTO"; file: string; thumb: string; durationSec: number | null };

export default function OrderMedia({ assets }: { assets: Item[] }) {
  const router = useRouter();
  const [editId, setEditId] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {assets.map((a) => (
        <div key={a.id} className="group relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.thumb} alt="" className="h-20 w-14 rounded-lg border border-zinc-200 object-cover" title={a.kind === "VIDEO" ? `Clip ${Math.round(a.durationSec ?? 0)}s` : "Photo"} />
          {a.kind === "PHOTO" && (
            <button type="button" title="Retoucher avec l'IA" onClick={() => setEditId(a.id)}
              className="absolute right-1 top-1 hidden rounded-md bg-white/90 p-1 text-zinc-600 shadow-sm hover:text-(--color-brand) group-hover:flex">
              <Wand2 className="size-3.5" />
            </button>
          )}
        </div>
      ))}
      <Link href="/studio" className="inline-flex h-20 w-14 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600">
        <Clapperboard className="size-4" />
        <span className="text-[10px]">Studio</span>
      </Link>

      {editId && (() => {
        const a = assets.find((x) => x.id === editId);
        return a ? <PhotoEditor asset={a} onClose={() => setEditId(null)} onKept={() => { setEditId(null); router.refresh(); }} /> : null;
      })()}
    </div>
  );
}
