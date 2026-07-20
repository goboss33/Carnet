"use client";

import { useActionState, useState } from "react";
import { createOrderForContact } from "@/app/actions";
import { Button } from "@/components/ui/button";

const input = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

export default function NewOrderForm({ contactId }: { contactId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createOrderForContact.bind(null, contactId), undefined);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700">
        + Nouvelle commande
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4" onClick={() => setOpen(false)}>
      <form action={action} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <p className="text-lg font-bold">Nouvelle commande</p>
        <label><span className={label}>Occasion *</span><input name="occasion" required autoFocus placeholder="Anniversaire 7 ans, mariage…" className={input} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label><span className={label}>Date de l'événement</span><input name="eventDate" type="date" className={input} /></label>
          <label><span className={label}>Parts</span><input name="parts" type="number" min="1" className={input} /></label>
          <label><span className={label}>Prix (CHF)</span><input name="priceQuoted" type="number" min="0" className={input} /></label>
          <label><span className={label}>Adresse (si livraison)</span><input name="deliveryAddress" className={input} /></label>
        </div>
        <label><span className={label}>Notes</span><textarea name="notes" rows={2} className={input} /></label>
        {state?.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-600">
            Annuler
          </button>
          <Button loading={pending} className="px-5 font-semibold">Créer</Button>
        </div>
      </form>
    </div>
  );
}
