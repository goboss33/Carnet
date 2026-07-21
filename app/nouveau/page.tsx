"use client";

import { useState } from "react";
import { useActionState } from "react";
import { User, Radio, Cake, StickyNote } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createLead } from "@/app/actions";
import { SOURCES } from "@/lib/statuts";
import { OCCASIONS } from "@/lib/order-options";
import { ChannelIcon } from "@/components/ui/channel-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui";

const input = "w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:border-(--color-brand)";
const label = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500";

// Canaux proposés à l'ajout manuel (le Configurateur est automatique, on l'exclut).
const CHANNELS = SOURCES.filter((s) => s.id !== "CONFIGURATEUR");

function SectionHeader({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 border-b border-zinc-100 pb-2 text-[13px] font-semibold text-zinc-700">
      <Icon className="size-4 text-(--color-brand)" /> {title}
      {hint ? <span className="font-normal text-zinc-400">{hint}</span> : null}
    </div>
  );
}

export default function Nouveau() {
  const [state, action, pending] = useActionState(createLead, undefined);
  const [source, setSource] = useState("AUTRE"); // « Non précisé » par défaut → choix conscient
  const [occCustom, setOccCustom] = useState(false);

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold tracking-tight text-zinc-900 sm:text-[22px]">Nouvelle fiche</h1>
      <p className="mb-6 text-sm text-zinc-500">30 secondes, promis — seuls le prénom et le canal comptent, le reste peut attendre.</p>

      <form action={action} className="max-w-2xl space-y-7 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-7">
        {/* Contact */}
        <section>
          <SectionHeader icon={User} title="Contact" />
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className={label}>Prénom *</span><input name="firstName" required autoFocus className={input} /></label>
            <label><span className={label}>Nom</span><input name="lastName" className={input} /></label>
            <label><span className={label}>Mobile</span><input name="phone" className={input} placeholder="+41…" /></label>
            <label><span className={label}>E-mail</span><input name="email" type="email" className={input} /></label>
            <label className="sm:col-span-2"><span className={label}>Instagram</span><input name="instagram" className={input} placeholder="@…" /></label>
          </div>
        </section>

        {/* Canal */}
        <section>
          <SectionHeader icon={Radio} title="Canal *" hint="comment est arrivée la demande" />
          <input type="hidden" name="source" value={source} />
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((s) => {
              const on = source === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSource(s.id)}
                  aria-pressed={on}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    on ? "border-(--color-brand) bg-(--color-brand-soft) text-(--color-brand)" : "border-zinc-300 text-zinc-600 hover:border-zinc-400",
                  )}
                >
                  <span className="flex size-4 items-center justify-center"><ChannelIcon source={s.id} className="size-4" /></span>
                  {s.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* La demande */}
        <section>
          <SectionHeader icon={Cake} title="La demande" hint="optionnel — peut attendre" />
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className={label}>Occasion</span>
              {occCustom ? (
                <div className="flex items-center gap-2">
                  <input name="occasion" placeholder="Précise l'occasion…" autoFocus className={input} />
                  <button type="button" onClick={() => setOccCustom(false)} className="shrink-0 text-[12px] font-medium text-zinc-500 hover:text-zinc-800">Liste</button>
                </div>
              ) : (
                <select name="occasion" defaultValue="" onChange={(e) => { if (e.currentTarget.value === "__autre__") setOccCustom(true); }} className={input}>
                  <option value="">—</option>
                  {OCCASIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  <option value="__autre__">Autre (préciser)…</option>
                </select>
              )}
            </label>
            <label><span className={label}>Date de l'événement</span><input name="eventDate" type="date" className={input} /></label>
            <label><span className={label}>Parts (estimation)</span><input name="parts" type="number" min="1" className={input} /></label>
            <label><span className={label}>Prix annoncé (CHF)</span><input name="priceQuoted" type="number" min="0" className={input} /></label>
            <label className="sm:col-span-2"><span className={label}>Adresse de livraison</span><input name="deliveryAddress" className={input} placeholder="Vide = retrait à l'atelier" /></label>
          </div>
        </section>

        {/* Notes */}
        <section>
          <SectionHeader icon={StickyNote} title="Notes" />
          <textarea name="notes" rows={3} className={input} placeholder="Thème, contraintes, contexte de la demande…" />
        </section>

        {state?.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
        <Button loading={pending} className="h-11 px-6 text-[15px] font-semibold">Créer la fiche</Button>
      </form>
    </>
  );
}
