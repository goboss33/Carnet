"use client";

import { useActionState } from "react";
import { createPartner } from "@/app/actions";

const input = "rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-600";

export default function PartnerForm() {
  const [state, action, pending] = useActionState(createPartner, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white p-5">
      <input name="name" placeholder="Nom (ex. Boulangerie du Port)" required className={`${input} w-56`} />
      <select name="type" className={input}>
        <option value="COMMERCE">Commerce</option>
        <option value="PHOTOGRAPHE">Photographe</option>
        <option value="WEDDING_PLANNER">Wedding planner</option>
        <option value="SALLE">Salle / domaine</option>
        <option value="AUTRE">Autre</option>
      </select>
      <input name="code" placeholder="Code (ex. BOUL-PULLY)" required className={`${input} w-40 uppercase`} />
      <div className="flex items-center gap-1">
        <input name="ratePct" type="number" defaultValue={10} min={0} max={50} className={`${input} w-16`} />
        <span className="text-sm text-stone-500">%</span>
      </div>
      <input name="contact" placeholder="Contact (tél/e-mail)" className={`${input} w-52`} />
      <button disabled={pending} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50">
        {pending ? "…" : "+ Partenaire"}
      </button>
      {state?.error && <p className="w-full text-sm font-medium text-red-600">{state.error}</p>}
    </form>
  );
}
