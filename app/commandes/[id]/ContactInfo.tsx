"use client";

/* Nom du client cliquable + « i » bleu → modale contact (coordonnées + WhatsApp
   + lien fiche). Le composant rend AUSSI le nom : tout le bloc nom+i est le
   déclencheur. Modale centrée, rendue via portail pour échapper au transform
   de <main> (comme SaveToast). La carte latérale reste sur desktop. */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Info, X, MessageCircle } from "lucide-react";
import { cn } from "@/lib/ui";

type Props = {
  contactId: string;
  name: string;
  sourceLabel: string;
  meta: string;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  facebook: string | null;
  notes: string | null;
  consentNewsletter: boolean;
  waHref: string | null;
  className?: string;
};

export function ContactInfo(props: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Voir la fiche contact"
        className={cn("group inline-flex items-center gap-2 text-left", props.className)}
      >
        <span className="min-w-0">{props.name}</span>
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-(--color-brand-soft) text-(--color-brand) transition-colors group-hover:bg-(--color-brand) group-hover:text-white">
          <Info className="size-[18px]" />
        </span>
      </button>

      {mounted && open && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
          <div className="relative z-10 max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Contact</p>
                <Link href={`/contacts/${props.contactId}`} className="mt-0.5 block truncate text-[17px] font-bold text-zinc-900 hover:underline">{props.name}</Link>
                <p className="mt-0.5 text-xs text-zinc-400">{[props.sourceLabel, props.meta].filter(Boolean).join(" · ")}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="shrink-0 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="size-5" /></button>
            </div>

            <dl className="space-y-1.5 text-sm">
              {props.phone && <div className="flex justify-between gap-3"><dt className="text-zinc-500">Mobile</dt><dd><a className="font-medium hover:underline" href={`tel:${props.phone}`}>{props.phone}</a></dd></div>}
              {props.email && <div className="flex justify-between gap-3"><dt className="text-zinc-500">E-mail</dt><dd className="min-w-0 truncate"><a className="font-medium hover:underline" href={`mailto:${props.email}`}>{props.email}</a></dd></div>}
              {props.instagram && <div className="flex justify-between gap-3"><dt className="text-zinc-500">Instagram</dt><dd className="font-medium">{props.instagram}</dd></div>}
              {props.facebook && <div className="flex justify-between gap-3"><dt className="text-zinc-500">Facebook</dt><dd className="min-w-0 truncate font-medium">{props.facebook}</dd></div>}
            </dl>

            {props.notes && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-zinc-600">{props.notes}</p>}
            {props.consentNewsletter && <p className="mt-2 text-[11px] font-semibold text-emerald-600">✓ Accepte la newsletter</p>}

            <div className="mt-4 flex gap-2">
              {props.waHref && (
                <a href={props.waHref} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-50 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              )}
              <Link href={`/contacts/${props.contactId}`} className="flex flex-1 items-center justify-center rounded-lg border border-zinc-300 py-2 text-sm font-semibold text-zinc-600 hover:border-zinc-400">Fiche complète</Link>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
