"use client";

/* ---------------------------------------------------------------------------
   Éditeur « zones colorées » (Seedream interactive editing).
   On dessine des rectangles de couleur sur la photo et on décrit ce que chaque
   couleur doit devenir ; à la génération, l'image annotée + un prompt
   « Red frame: … / Green frame: … » partent au modèle.
--------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Wand2, Trash2 } from "lucide-react";

const COLORS = [
  { key: "Red", css: "#ef4444" },
  { key: "Green", css: "#22c55e" },
  { key: "Yellow", css: "#eab308" },
  { key: "Blue", css: "#3b82f6" },
  { key: "Purple", css: "#a855f7" },
];

type Zone = { color: string; css: string; x: number; y: number; w: number; h: number; note: string };

export default function ZoneEditor({ src, pending, onGenerate }: {
  src: string; pending: boolean; onGenerate: (dataUri: string, prompt: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [draft, setDraft] = useState<Zone | null>(null);
  const drag = useRef<{ x0: number; y0: number } | null>(null);

  useEffect(() => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => { imgRef.current = im; setNat({ w: im.naturalWidth, h: im.naturalHeight }); };
    im.src = src;
  }, [src]);

  // coordonnées relatives (0..1) depuis l'événement souris
  const rel = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const onDown = (e: React.PointerEvent) => {
    if (pending) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = rel(e); drag.current = { x0: p.x, y0: p.y };
    setDraft({ color: color.key, css: color.css, x: p.x, y: p.y, w: 0, h: 0, note: "" });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = rel(e); const d = drag.current;
    setDraft({ color: color.key, css: color.css, x: Math.min(d.x0, p.x), y: Math.min(d.y0, p.y), w: Math.abs(p.x - d.x0), h: Math.abs(p.y - d.y0), note: "" });
  };
  const onUp = () => {
    if (draft && draft.w > 0.03 && draft.h > 0.03) setZones((z) => [...z, draft]);
    setDraft(null); drag.current = null;
  };

  const generate = () => {
    const im = imgRef.current;
    if (!im || !nat) return;
    const cv = document.createElement("canvas");
    cv.width = nat.w; cv.height = nat.h;
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(im, 0, 0);
    ctx.lineWidth = Math.max(4, Math.round(nat.w / 260));
    for (const z of zones) {
      ctx.strokeStyle = z.css;
      ctx.strokeRect(z.x * nat.w, z.y * nat.h, z.w * nat.w, z.h * nat.h);
    }
    let dataUri: string;
    try { dataUri = cv.toDataURL("image/jpeg", 0.92); }
    catch { return; } // image tainted (ne devrait pas arriver, même origine)
    const lines = zones.filter((z) => z.note.trim()).map((z) => `${z.color} frame: ${z.note.trim()}`);
    const prompt = (lines.length ? lines.join("\n") + "\n" : "") + "Apply these region edits precisely. Keep everything outside the colored frames exactly the same. Do not render the colored frames in the output. Photorealistic result.";
    onGenerate(dataUri, prompt);
  };

  const filled = zones.filter((z) => z.note.trim()).length;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Couleur</span>
        {COLORS.map((c) => (
          <button key={c.key} type="button" onClick={() => setColor(c)} aria-label={c.key}
            className="size-6 rounded-full border-2" style={{ background: c.css, borderColor: color.key === c.key ? "#18181b" : "transparent" }} />
        ))}
        <span className="ml-auto text-[11px] text-zinc-400">Dessine un rectangle sur la photo</span>
      </div>

      <div ref={wrapRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        className="relative w-full touch-none select-none overflow-hidden rounded-lg border border-zinc-200"
        style={{ aspectRatio: nat ? `${nat.w}/${nat.h}` : "1" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="pointer-events-none h-full w-full object-contain" draggable={false} />
        {[...zones, ...(draft ? [draft] : [])].map((z, i) => (
          <span key={i} className="absolute border-2" style={{
            left: `${z.x * 100}%`, top: `${z.y * 100}%`, width: `${z.w * 100}%`, height: `${z.h * 100}%`,
            borderColor: z.css, background: `${z.css}22`,
          }} />
        ))}
      </div>

      {zones.length > 0 && (
        <div className="space-y-1.5">
          {zones.map((z, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="size-3.5 shrink-0 rounded-full" style={{ background: z.css }} />
              <input value={z.note} onChange={(e) => setZones((zs) => zs.map((x, k) => k === i ? { ...x, note: e.target.value } : x))}
                placeholder={`Ce que devient la zone ${z.color}…`}
                className="h-8 flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 text-[13px] outline-none focus:border-(--color-brand)" />
              <button type="button" onClick={() => setZones((zs) => zs.filter((_, k) => k !== i))} className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:text-red-500">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" variant="outline" disabled={pending || filled === 0} onClick={generate}>
          {pending ? <Loader2 className="animate-spin" /> : <Wand2 />} Générer ({filled} zone{filled > 1 ? "s" : ""})
        </Button>
      </div>
    </div>
  );
}
