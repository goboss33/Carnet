"use client";

/* Bouton « Brouillon de réponse (IA) » sur la fiche : appelle Gemini côté
   serveur, affiche le message éditable + un lien WhatsApp pré-rempli. */

import { useState, useTransition } from "react";
import { generateDraft } from "@/app/actions";

export default function DraftReply({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition();
  const [text, setText] = useState<string | null>(null);
  const [waHref, setWaHref] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = () =>
    start(async () => {
      setErr(null);
      const r = await generateDraft(orderId);
      if (!r.ok) {
        setErr(r.error ?? "Échec de la génération.");
        setText(null);
      } else {
        setText(r.text ?? "");
        setWaHref(r.waHref ?? null);
      }
    });

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 text-sm">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Réponse au client</p>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="w-full rounded-lg border border-stone-300 py-2 text-sm font-semibold text-stone-700 hover:border-stone-500 disabled:opacity-60"
      >
        {pending ? "Rédaction en cours…" : text ? "↻ Régénérer" : "✍️ Brouillon de devis (IA)"}
      </button>
      {err && <p className="mt-2 text-xs font-semibold text-red-600">{err}</p>}
      {text !== null && !err && (
        <div className="mt-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-600"
          />
          <div className="mt-2 flex gap-2">
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-lg border border-emerald-600/30 bg-emerald-50 py-1.5 text-center text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                📲 Ouvrir WhatsApp
              </a>
            )}
            <button
              type="button"
              onClick={copy}
              className="flex-1 rounded-lg border border-stone-300 py-1.5 text-xs font-semibold text-stone-600 hover:border-stone-500"
            >
              {copied ? "Copié ✓" : "Copier"}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-stone-400">Relis avant d'envoyer — l'IA se trompe parfois sur les détails.</p>
        </div>
      )}
    </div>
  );
}
