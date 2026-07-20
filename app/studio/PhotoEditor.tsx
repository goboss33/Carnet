"use client";

/* ---------------------------------------------------------------------------
   PhotoEditor — module de retouche IA autonome, ouvrable de partout
   (bibliothèque, fiche commande, wizard). Le moteur (aiEdit*) est découplé :
   ce composant ne connaît qu'un asset { id, file }.

   UI : une image unique avec comparateur avant/après à poignée, et une barre-
   composeur COLLÉE EN BAS (prompt pleine largeur, puis modèle + outils +
   Générer). En mode « Zones », c'est le même bouton Générer qui déclenche.
   Références d'images (#1, #2) : lot 2 — l'emplacement est déjà là.
--------------------------------------------------------------------------- */

import { useRef, useState, useTransition } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Wand2, Sparkles, Target, ImagePlus, ChevronUp, Check, GripVertical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/ui";
import { aiEditSubmit, aiEditPoll, aiEditKeep } from "./actions";
import ZoneEditor, { type ZoneEditorHandle } from "./ZoneEditor";

export type EditableAsset = { id: string; file: string; thumb?: string };

const PRESETS = [
  { id: "photoshoot", label: "Photoshoot présentoir" },
  { id: "cleanbg", label: "Nettoyer le fond" },
  { id: "studiolight", label: "Lumière studio" },
  { id: "zoom", label: "Zoom sur un détail" },
];
const MODELS = [
  { id: "gemini", label: "Nano Banana Pro", short: "Nano Banana" },
  { id: "seedream", label: "Seedream", short: "Seedream" },
] as const;

export default function PhotoEditor({
  asset, onClose, onKept, keepLabel = "Ajouter à la bibliothèque",
}: {
  asset: EditableAsset;
  onClose: () => void;
  onKept: (newId: string) => void;
  keepLabel?: string;
}) {
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<"gemini" | "seedream">("gemini");
  const [zonesOn, setZonesOn] = useState(false);
  const [zonesReady, setZonesReady] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pos, setPos] = useState(50);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const zoneRef = useRef<ZoneEditorHandle>(null);

  const showZones = zonesOn && model === "seedream";
  const chip = MODELS.find((m) => m.id === model)!;
  const canGenerate = prompt.trim().length >= 4;

  const run = (opts: { presetId?: string; prompt?: string; imageDataUri?: string }) =>
    start(async () => {
      setPreview(null);
      const sub = await aiEditSubmit(asset.id, { ...opts, model });
      if (sub.error) return toast.error(sub.error);
      if (sub.url) { setPreview(sub.url); setPos(50); return; }
      if (!sub.requestId) return toast.error("Envoi impossible.");
      const rid = sub.requestId;
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        const p = await aiEditPoll(rid);
        if (p.error) return toast.error(p.error);
        if (p.url) { setPreview(p.url); setPos(50); return; }
      }
      toast.error("La retouche prend trop de temps — réessaie.");
    });

  const keep = () =>
    start(async () => {
      if (!preview) return;
      const r = await aiEditKeep(asset.id, preview, prompt || "retouche IA");
      if (r.error) return toast.error(r.error);
      toast.success("Variante enregistrée.");
      onKept(r.id!);
    });

  const pickModel = (m: "gemini" | "seedream") => {
    setModel(m); setMenuOpen(false); setPreview(null);
    if (m === "gemini") setZonesOn(false);
  };

  const scrub = (clientX: number) => {
    const el = stageRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };

  const onGenerate = () => (showZones ? zoneRef.current?.generate() : run({ prompt }));
  const genDisabled = showZones ? zonesReady === 0 : !canGenerate;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Retoucher la photo" desc="Le décor et la lumière changent, jamais le gâteau. L'original est conservé." className="max-w-xl">

        {/* ------------------------------------------ zone défilante : image */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {showZones && !preview ? (
            <ZoneEditor ref={zoneRef} src={asset.file} pending={pending} onReadyChange={setZonesReady}
              onGenerate={(dataUri, p) => run({ prompt: p, imageDataUri: dataUri })} />
          ) : (
            <div
              ref={stageRef}
              className="relative touch-none select-none overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50"
              style={{ height: "clamp(220px, 44vh, 460px)", cursor: preview ? "ew-resize" : "default" }}
              onPointerDown={preview ? (e) => {
                e.preventDefault();
                scrub(e.clientX);
                const move = (ev: PointerEvent) => scrub(ev.clientX);
                const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
              } : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.file} alt="original" className="pointer-events-none absolute inset-0 h-full w-full object-contain" draggable={false} />
              {preview && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="résultat" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-contain" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
                  <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
                    <div className="absolute inset-y-0 -ml-px w-0.5 bg-white/90" />
                    <div className="absolute top-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-300 bg-white shadow-sm">
                      <GripVertical className="size-4 text-zinc-500" />
                    </div>
                  </div>
                  <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] text-zinc-600">avant</span>
                  <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-(--color-brand)">après</span>
                </>
              )}
              {pending && !preview && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                  <Loader2 className="size-6 animate-spin text-zinc-400" />
                </div>
              )}
            </div>
          )}

          {!showZones && !preview && (
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" disabled={pending} onClick={() => run({ presetId: p.id })}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-[12px] text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 active:scale-95 disabled:opacity-50">
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ------------------------------------------ barre-composeur (collée) */}
        <div className="mt-3 shrink-0 rounded-2xl border border-zinc-300 p-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={showZones ? "Décris chaque zone au-dessus, puis Générer" : "Décris ta retouche…"}
            disabled={pending || showZones}
            onKeyDown={(e) => { if (e.key === "Enter" && !genDisabled) onGenerate(); }}
            className="w-full bg-transparent px-1 py-1 text-[13px] text-zinc-900 outline-none placeholder:text-zinc-400 disabled:opacity-50"
          />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {/* modèle */}
              <div className="relative min-w-0">
                <button type="button" disabled={pending} onClick={() => setMenuOpen((v) => !v)}
                  className="flex min-w-0 max-w-[130px] items-center gap-1 rounded-lg bg-zinc-100 px-2 py-1.5 text-[12px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-200 active:scale-95 disabled:opacity-50">
                  <Sparkles className="size-3.5 shrink-0 text-(--color-brand)" />
                  <span className="truncate">{chip.short}</span>
                  <ChevronUp className={cn("size-3.5 shrink-0 text-zinc-400 transition-transform", !menuOpen && "rotate-180")} />
                </button>
                {menuOpen && (
                  <div className="absolute bottom-full left-0 z-10 mb-1 w-52 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
                    {MODELS.map((m) => (
                      <button key={m.id} type="button" onClick={() => pickModel(m.id)}
                        className={cn("flex w-full items-center justify-between px-3 py-2 text-[13px] hover:bg-zinc-50", model === m.id ? "font-semibold text-zinc-900" : "text-zinc-600")}>
                        {m.label} {model === m.id && <Check className="size-3.5 text-(--color-brand)" />}
                      </button>
                    ))}
                    <p className="border-t border-zinc-100 px-3 py-1.5 text-[11px] text-zinc-400">« Zones précises » : Seedream uniquement.</p>
                  </div>
                )}
              </div>
              {/* référence (lot 2) */}
              <button type="button" disabled title="Images de référence — bientôt"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-zinc-300">
                <ImagePlus className="size-4" />
              </button>
              {/* zones */}
              <button type="button" disabled={model !== "seedream" || pending} onClick={() => setZonesOn((v) => !v)}
                title={model === "seedream" ? "Zones précises" : "Zones précises : passe sur Seedream"}
                className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors active:scale-95 disabled:opacity-40",
                  showZones ? "border-(--color-brand) bg-(--color-brand-soft) text-(--color-brand)" : "border-zinc-200 text-zinc-500 hover:text-zinc-800")}>
                <Target className="size-4" />
              </button>
            </div>
            <Button size="sm" variant="brand" loading={pending} disabled={genDisabled} onClick={onGenerate} title="Générer" aria-label="Générer" className="shrink-0">
              <Wand2 /> <span className="hidden sm:inline">Générer</span>
            </Button>
          </div>
        </div>

        {/* ------------------------------------------------------------ footer */}
        <div className="mt-2 flex shrink-0 items-center justify-between gap-2 border-t border-zinc-100 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Fermer</Button>
          <Button size="sm" loading={pending && !!preview} disabled={!preview} onClick={keep}>
            <Check /> {keepLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
