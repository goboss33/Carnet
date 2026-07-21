"use client";

/* Miniatures des médias liés à une commande, avec retouche IA au survol
   (ouvre le module PhotoEditor). Rendu par StudioMedia (serveur). */

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Wand2 } from "lucide-react";
import PhotoEditor from "@/app/studio/PhotoEditor";
import { MediaTile, TileAction } from "@/app/studio/MediaTile";

type Item = { id: string; kind: "VIDEO" | "PHOTO"; file: string; thumb: string; durationSec: number | null };

export default function OrderMedia({ assets }: { assets: Item[] }) {
  const router = useRouter();
  const [editId, setEditId] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {assets.map((a) => (
        <MediaTile
          key={a.id}
          thumb={a.thumb}
          className="h-20 w-14"
          badge={a.kind === "VIDEO" ? <span className="rounded bg-black/60 px-1 text-[10px] text-white">{Math.round(a.durationSec ?? 0)}s</span> : undefined}
          actions={a.kind === "PHOTO" ? <TileAction icon={<Wand2 />} label="Retoucher" tone="brand" onClick={() => setEditId(a.id)} /> : undefined}
        />
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
