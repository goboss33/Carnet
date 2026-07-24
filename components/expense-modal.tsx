"use client";

/* Modale d'édition/création d'une dépense — partagée par la Compta et la
   cloche de notifications (tickets du bot à compléter). Enregistre via les
   server actions ; onSaved permet au parent de rafraîchir sa liste. */

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { X, Check, FileText, Camera } from "lucide-react";
import { updateExpense, createExpense, deleteExpense } from "@/app/actions";
import { CATEGORIES } from "@/lib/money";
import MediaViewer from "@/app/components/MediaViewer";

export type ExpenseDraft = {
  id?: string;
  dateISO?: string;
  merchant?: string;
  category?: string;
  totalCents?: number;
  notes?: string;
  receiptPath?: string;
};

const fieldCls = "h-9 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-(--color-brand)";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

export function ExpenseModal({ row, onClose, onSaved }: { row: ExpenseDraft; onClose: () => void; onSaved?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isNew = !row.id;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      if (isNew) await createExpense(fd);
      else await updateExpense(row.id!, fd);
      router.refresh();
      onSaved?.();
      onClose();
    });
  };
  const remove = () => {
    if (!row.id || !window.confirm("Supprimer cette dépense ? Définitif.")) return;
    start(async () => {
      await deleteExpense(row.id!);
      router.refresh();
      onSaved?.();
      onClose();
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-[1px]" onClick={onClose} />
      <form onSubmit={submit} className="relative z-10 max-h-[90vh] w-full max-w-sm space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[15px] font-bold text-zinc-900">{isNew ? "Nouvelle dépense" : "Dépense"}</p>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="size-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label><span className={labelCls}>Date</span><input name="date" type="date" defaultValue={row.dateISO ?? new Date().toISOString().slice(0, 10)} className={fieldCls} /></label>
          <label><span className={labelCls}>Montant (CHF) *</span><input name="totalChf" type="number" step="0.05" min="0" required defaultValue={row.totalCents ? row.totalCents / 100 : ""} autoFocus={isNew || !row.totalCents} className={fieldCls} /></label>
          <label className="col-span-2"><span className={labelCls}>Commerçant</span><input name="merchant" placeholder="Migros, Landi…" defaultValue={row.merchant ?? ""} className={fieldCls} /></label>
          <label className="col-span-2">
            <span className={labelCls}>Catégorie</span>
            <select name="category" defaultValue={row.category ?? "MATIERES_PREMIERES"} className={fieldCls}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
          </label>
          <label className="col-span-2"><span className={labelCls}>Note</span><input name="notes" placeholder="Optionnel" defaultValue={row.notes ?? ""} className={fieldCls} /></label>
          <label className="col-span-2">
            <span className={labelCls}>Justificatif (photo ou PDF)</span>
            <input
              name="receipt"
              type="file"
              accept="image/*,application/pdf"
              className="block w-full text-[13px] text-zinc-500 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-zinc-700 hover:file:bg-zinc-200"
            />
          </label>
        </div>

        {row.receiptPath ? (
          <div className="flex items-center justify-between gap-2">
            <MediaViewer src={`/api/receipts/${row.receiptPath}`} kind={row.receiptPath.endsWith(".pdf") ? "pdf" : "image"} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-(--color-brand) hover:underline" title="Voir le justificatif">
              {row.receiptPath.endsWith(".pdf") ? <FileText className="size-4" /> : <Camera className="size-4" />} Voir le justificatif
            </MediaViewer>
            <span className="text-[11px] text-zinc-400">un nouveau fichier le remplace</span>
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
          {!isNew ? (
            <button type="button" onClick={remove} className="text-[13px] text-zinc-400 transition-colors hover:text-red-600">Supprimer</button>
          ) : <span />}
          <button disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50">
            <Check className="size-4" /> {isNew ? "Ajouter" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
