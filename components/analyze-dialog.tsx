"use client";

/* Analyse d'un échange client — en deux temps, jamais d'écriture surprise :
   1) saisie : texte collé (le plus fiable) OU une/plusieurs captures ;
   2) REVUE : ce que l'IA a compris, champ par champ, décochable, avec les
      avertissements (montants sans citation, date écartée…). Rien n'est
      enregistré tant que l'utilisateur n'a pas validé.
   Modale portalisée (piège des transforms de main.animate-page). */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X, ClipboardType, ImagePlus, AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { analyzeConversation, applyAnalysisToOrder, createOrderFromAnalysis } from "@/app/actions";
import type { ProjectAnalysis } from "@/lib/project-analyze";
import { tileForOcr } from "@/lib/client-image";
import { cn } from "@/lib/ui";

type Mode = "texte" | "image";
type Row = { key: string; label: string; value: string };

const chf = (c: number) => `CHF ${(c / 100).toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AnalyzeDialog({ orderId, trigger }: { orderId?: string; trigger: "button" | "card" }) {
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const close = () => { setMode(null); setText(""); setFiles([]); setAnalysis(null); setBusy(false); };
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    if (mode) window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [mode]);

  /* ---------------- étape 1 : analyse (aucune écriture) ---------------- */
  const run = async () => {
    setBusy(true);
    const fd = new FormData();
    if (mode === "texte") fd.append("text", text);
    else for (const f of files) for (const tile of await tileForOcr(f)) fd.append("files", tile);
    const r = await analyzeConversation(fd);
    setBusy(false);
    if (r.error || !r.analysis) { toast.error(r.error ?? "Analyse impossible."); return; }
    const a = r.analysis;
    setAnalysis(a);
    // Tout ce qui a une valeur est coché par défaut ; l'utilisateur décoche.
    const init: Record<string, boolean> = {};
    for (const k of ["occasion", "themeNote", "celebrant", "celebrantAge", "eventDate", "parts", "tiers", "price", "items", "client", "quoteSent"]) init[k] = true;
    setChecked(init);
  };

  /* ---------------- étape 2 : application des champs cochés ------------ */
  const apply = async () => {
    if (!analysis) return;
    const a = analysis;
    const p: Record<string, unknown> = {};
    if (checked.occasion && a.occasion) p.occasion = a.occasion;
    if (checked.themeNote && a.themeNote) p.themeNote = a.themeNote;
    if (checked.celebrant && a.celebrant) p.celebrant = a.celebrant;
    if (checked.celebrantAge && a.celebrantAge) p.celebrantAge = a.celebrantAge;
    if (checked.eventDate && a.eventDate) p.eventDate = a.eventDate;
    if (checked.parts && a.parts && !a.items?.length) p.parts = a.parts;
    if (checked.tiers && a.tiers && !a.items?.length) p.tiers = a.tiers;
    if (checked.price && a.price && !a.items?.length) p.price = Math.round(a.price);
    if (checked.items && a.items?.length) p.items = a.items;
    if (checked.quoteSent && a.quoteSent) p.quoteSent = true;
    if (checked.client && a.client) p.client = a.client;
    if (a.channel) p.channel = a.channel;

    setBusy(true);
    if (orderId) {
      const r = await applyAnalysisToOrder(orderId, p);
      if (r.error) { setBusy(false); toast.error(r.error); return; }
      if (!r.applied) { setBusy(false); toast.message("Rien de coché — fiche inchangée."); return; }
      // Rechargement COMPLET : la fiche est un formulaire non contrôlé (defaultValue)
      // et l'éditeur de lignes a son propre état — un router.refresh() laisserait les
      // anciennes valeurs à l'écran, que l'auto-save ré-enregistrerait par-dessus.
      window.location.reload();
    } else {
      try {
        const r = await createOrderFromAnalysis(p);
        if (r?.error) { toast.error(r.error); setBusy(false); }
      } catch { /* redirection serveur en cours */ }
    }
  };

  /* ---------------- revue : lignes lisibles ---------------- */
  const rows: Row[] = analysis
    ? ([
        analysis.occasion && { key: "occasion", label: "Occasion", value: analysis.occasion },
        analysis.celebrant && { key: "celebrant", label: "Fêté·e", value: analysis.celebrant },
        analysis.celebrantAge && { key: "celebrantAge", label: "Âge", value: `${analysis.celebrantAge} ans` },
        analysis.themeNote && { key: "themeNote", label: "Thème", value: analysis.themeNote },
        analysis.eventDate && { key: "eventDate", label: "Date", value: new Date(`${analysis.eventDate}T12:00:00Z`).toLocaleDateString("fr-CH") },
        !analysis.items?.length && analysis.parts && { key: "parts", label: "Parts", value: String(analysis.parts) },
        !analysis.items?.length && analysis.tiers && { key: "tiers", label: "Étages", value: String(analysis.tiers) },
        !analysis.items?.length && analysis.price && { key: "price", label: "Prix", value: `CHF ${analysis.price.toLocaleString("fr-CH")}` },
        analysis.quoteSent && { key: "quoteSent", label: "Statut", value: "Devis déjà envoyé" },
        analysis.client && {
          key: "client",
          label: "Contact",
          value: [analysis.client.company, [analysis.client.firstName, analysis.client.lastName].filter(Boolean).join(" "), analysis.client.email, analysis.client.phone].filter(Boolean).join(" · "),
        },
      ].filter(Boolean) as Row[])
    : [];

  const trg =
    trigger === "card" ? (
      <button
        type="button"
        onClick={() => setMenu((v) => !v)}
        className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-dashed border-(--color-brand) bg-(--color-brand-soft)/40 px-4 py-3.5 text-left transition hover:bg-(--color-brand-soft)"
      >
        <Sparkles className="size-5 shrink-0 text-(--color-brand)" />
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold text-zinc-800">Analyser un échange</span>
          <span className="block text-[12px] text-zinc-500">Colle le texte d'un e-mail ou dépose des captures — Carnet propose la fiche, tu valides.</span>
        </span>
        <ChevronDown className={cn("ml-auto size-4 shrink-0 text-(--color-brand) transition-transform", menu && "rotate-180")} />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setMenu((v) => !v)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-[13px] font-medium text-zinc-700 transition hover:bg-zinc-50"
      >
        <Sparkles className="size-3.5" /> Analyser <ChevronDown className={cn("size-3 transition-transform", menu && "rotate-180")} />
      </button>
    );

  return (
    <div className={cn("relative", trigger === "card" && "block")}>
      {trg}

      {/* Menu : texte ou image */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
          <div className={cn("absolute z-50 mt-1 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg", trigger === "card" ? "left-0 top-full -mt-3" : "right-0 top-full")}>
            <button type="button" onClick={() => { setMenu(false); setMode("texte"); }} className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-zinc-50">
              <ClipboardType className="mt-0.5 size-4 shrink-0 text-(--color-brand)" />
              <span>
                <span className="block text-[13px] font-medium text-zinc-800">Coller le texte</span>
                <span className="block text-[11px] text-zinc-400">Le plus fiable — recommandé pour les e-mails</span>
              </span>
            </button>
            <button type="button" onClick={() => { setMenu(false); setMode("image"); }} className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-zinc-50">
              <ImagePlus className="mt-0.5 size-4 shrink-0 text-(--color-brand)" />
              <span>
                <span className="block text-[13px] font-medium text-zinc-800">Envoyer des captures</span>
                <span className="block text-[11px] text-zinc-400">WhatsApp, Instagram — plusieurs images possibles</span>
              </span>
            </button>
          </div>
        </>
      )}

      {/* Modale — portalisée */}
      {mode && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={close}>
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-zinc-900">
                <Sparkles className="size-4 text-(--color-brand)" />
                {analysis ? "Ce que Carnet a compris" : mode === "texte" ? "Coller l'échange" : "Envoyer des captures"}
              </p>
              <button type="button" onClick={close} className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"><X className="size-5" /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {/* --------- saisie --------- */}
              {!analysis && mode === "texte" && (
                <>
                  <p className="mb-2 text-[12px] text-zinc-500">Sélectionne tout l'e-mail (Ctrl+A puis Ctrl+C dans ta messagerie) et colle-le ici. Le texte donne des résultats bien plus fiables qu'une capture.</p>
                  <textarea
                    autoFocus
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={12}
                    placeholder="Colle ici l'échange complet…"
                    className="w-full resize-y rounded-lg border border-zinc-300 p-3 text-[13px] outline-none focus:border-(--color-brand)"
                  />
                </>
              )}
              {!analysis && mode === "image" && (
                <>
                  <p className="mb-2 text-[12px] text-zinc-500">Dépose une ou plusieurs captures. Les captures très longues sont automatiquement découpées pour rester lisibles.</p>
                  <button type="button" onClick={() => fileInput.current?.click()} className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-zinc-300 py-8 text-zinc-400 transition hover:border-(--color-brand) hover:text-(--color-brand)">
                    <ImagePlus className="size-6" />
                    <span className="text-[13px] font-medium">{files.length ? `${files.length} image${files.length > 1 ? "s" : ""} sélectionnée${files.length > 1 ? "s" : ""}` : "Choisir des images"}</span>
                  </button>
                  <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
                  {files.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[12px] text-zinc-500">
                      {files.map((f) => <li key={f.name} className="truncate">• {f.name}</li>)}
                    </ul>
                  )}
                </>
              )}

              {/* --------- revue --------- */}
              {analysis && (
                <>
                  {analysis.warnings.length > 0 && (
                    <div className="mb-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span>
                        <b>Écarté par prudence :</b> {analysis.warnings.join(" · ")}.
                      </span>
                    </div>
                  )}
                  {rows.length === 0 && !analysis.items?.length && (
                    <p className="py-6 text-center text-[13px] text-zinc-500">Rien d'exploitable — si c'était une capture, réessaie en collant le texte.</p>
                  )}

                  <div className="divide-y divide-zinc-100">
                    {rows.map((r) => (
                      <label key={r.key} className="flex cursor-pointer items-start gap-3 py-2.5">
                        <input type="checkbox" checked={checked[r.key] ?? false} onChange={(e) => setChecked((c) => ({ ...c, [r.key]: e.target.checked }))} className="mt-0.5 size-4 shrink-0 accent-(--color-brand)" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{r.label}</span>
                          <span className="block break-words text-[13px] text-zinc-800">{r.value}</span>
                        </span>
                      </label>
                    ))}

                    {analysis.items?.length ? (
                      <label className="flex cursor-pointer items-start gap-3 py-2.5">
                        <input type="checkbox" checked={checked.items ?? false} onChange={(e) => setChecked((c) => ({ ...c, items: e.target.checked }))} className="mt-0.5 size-4 shrink-0 accent-(--color-brand)" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                            Mode ligne · {analysis.items.length} poste{analysis.items.length > 1 ? "s" : ""}
                          </span>
                          <span className="mt-1 block space-y-0.5">
                            {analysis.items.map((it) => (
                              <span key={it.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                                <span className="min-w-0 truncate text-zinc-800">{it.qty && it.unit ? `${it.qty} × ` : ""}{it.label}{it.opt ? " (option)" : ""}</span>
                                <span className={cn("shrink-0 tabular-nums", it.cents ? "text-zinc-800" : "text-amber-600")}>{it.cents ? chf(it.cents) : "à chiffrer"}</span>
                              </span>
                            ))}
                          </span>
                        </span>
                      </label>
                    ) : null}
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
                    Décoche ce qui est faux — rien ne sera enregistré sans ta validation.
                    {orderId ? " Les champs cochés remplacent ceux de la fiche." : " Le contact sera créé (ou retrouvé s'il existe déjà)."}
                  </p>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50 px-5 py-3">
              <button type="button" onClick={close} className="rounded-lg px-3 py-2 text-[13px] font-medium text-zinc-500 transition hover:text-zinc-800">Annuler</button>
              {!analysis ? (
                <button
                  type="button"
                  disabled={busy || (mode === "texte" ? text.trim().length < 20 : files.length === 0)}
                  onClick={run}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? <><Loader2 className="size-3.5 animate-spin" /> Analyse…</> : <><Sparkles className="size-3.5" /> Analyser</>}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={apply}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-(--color-brand) px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  {busy ? <><Loader2 className="size-3.5 animate-spin" /> Application…</> : orderId ? "Appliquer à la fiche" : "Créer la fiche"}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
