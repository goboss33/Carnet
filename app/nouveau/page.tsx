"use client";

import { useActionState } from "react";
import { createLead } from "@/app/actions";
import { SOURCES } from "@/lib/statuts";
import { Button } from "@/components/ui/button";

const input = "w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-[15px] outline-none focus:border-(--color-brand)";
const label = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500";

export default function Nouveau() {
  const [state, action, pending] = useActionState(createLead, undefined);
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold tracking-tight text-zinc-900 sm:text-[22px]">Nouvelle fiche</h1>
      <p className="mb-6 text-sm text-zinc-500">30 secondes, promis — seuls le prénom et le canal comptent, le reste peut attendre.</p>
      <form action={action} className="max-w-2xl space-y-5 rounded-2xl border border-zinc-200 bg-white p-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className={label}>Prénom *</span><input name="firstName" required className={input} /></label>
          <label><span className={label}>Nom</span><input name="lastName" className={input} /></label>
          <label><span className={label}>Mobile</span><input name="phone" className={input} placeholder="+41…" /></label>
          <label><span className={label}>E-mail</span><input name="email" type="email" className={input} /></label>
          <label><span className={label}>Instagram</span><input name="instagram" className={input} placeholder="@…" /></label>
          <label>
            <span className={label}>Canal *</span>
            <select name="source" className={input} defaultValue="WHATSAPP">
              {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label><span className={label}>Occasion</span><input name="occasion" className={input} placeholder="Anniversaire 6 ans, mariage…" /></label>
          <label><span className={label}>Date de l'événement</span><input name="eventDate" type="date" className={input} /></label>
          <label><span className={label}>Parts (estimation)</span><input name="parts" type="number" min="1" className={input} /></label>
          <label><span className={label}>Prix annoncé (CHF)</span><input name="priceQuoted" type="number" min="0" className={input} /></label>
          <label className="sm:col-span-2"><span className={label}>Adresse de livraison (si livraison)</span><input name="deliveryAddress" className={input} placeholder="Vide = retrait à l'atelier" /></label>
        </div>
        <label><span className={label}>Notes</span><textarea name="notes" rows={3} className={input} placeholder="Thème, contraintes, contexte de la demande…" /></label>
        {state?.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
        <Button loading={pending} className="h-11 px-6 text-[15px] font-semibold">Créer la fiche</Button>
      </form>
    </>
  );
}
