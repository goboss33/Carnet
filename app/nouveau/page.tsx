"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { User, Radio, Cake, StickyNote, ChevronDown, Check, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createLead } from "@/app/actions";
import { SOURCES } from "@/lib/statuts";
import { OCCASIONS } from "@/lib/order-options";
import { occasionIcon } from "@/lib/occasions";
import { ChannelIcon } from "@/components/ui/channel-icon";
import { TiersParts, DeliveryFields } from "@/components/order-fields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui";

const input = "w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:border-(--color-brand)";
const label = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500";
const labelRow = "mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500";
const trigger = "flex w-full items-center gap-2.5 rounded-lg border border-zinc-300 px-3.5 py-2.5 text-left text-[15px] outline-none transition-colors hover:border-zinc-400 focus:border-(--color-brand)";

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

/* Canal en menu déroulant (même esprit que la fiche : icône + libellé + menu). */
function ChannelField({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const cur = SOURCES.find((s) => s.id === value) ?? SOURCES[SOURCES.length - 1];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className={trigger}>
        <span className="flex size-5 items-center justify-center"><ChannelIcon source={cur.id} className="size-4" /></span>
        <span className="flex-1 font-medium text-zinc-800">{cur.label}</span>
        <ChevronDown className={cn("size-4 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
            {CHANNELS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { onChange(s.id); setOpen(false); }}
                className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-zinc-50", s.id === value ? "font-semibold text-zinc-900" : "text-zinc-600")}
              >
                <span className="flex size-4 shrink-0 items-center justify-center"><ChannelIcon source={s.id} className="size-4" /></span>
                <span className="flex-1">{s.label}</span>
                {s.id === value && <Check className="size-4 text-(--color-brand)" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* Occasion : même liste et mêmes icônes que la fiche commande. */
function OccasionField({ value, onChange }: { value: string; onChange: (o: string) => void }) {
  const [open, setOpen] = useState(false);
  const Icon = value ? occasionIcon(value) : Sparkles;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className={trigger}>
        {value ? (
          <span className="flex size-5 items-center justify-center rounded-full bg-(--color-brand-soft) text-(--color-brand)"><Icon className="size-3.5" /></span>
        ) : (
          <span className="flex size-5 items-center justify-center text-zinc-400"><Sparkles className="size-4" /></span>
        )}
        <span className={cn("flex-1", value ? "font-medium text-zinc-800" : "text-zinc-400")}>{value || "À définir"}</span>
        <ChevronDown className={cn("size-4 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-zinc-50", !value ? "font-semibold text-zinc-900" : "text-zinc-500")}
            >
              <span className="flex size-4 shrink-0 items-center justify-center text-zinc-300">—</span>
              <span className="flex-1">À définir</span>
              {!value && <Check className="size-4 text-(--color-brand)" />}
            </button>
            {OCCASIONS.map((o) => {
              const I = occasionIcon(o);
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => { onChange(o); setOpen(false); }}
                  className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-zinc-50", o === value ? "font-semibold text-zinc-900" : "text-zinc-600")}
                >
                  <I className="size-4 shrink-0 text-zinc-400" />
                  <span className="flex-1">{o}</span>
                  {o === value && <Check className="size-4 text-(--color-brand)" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function Nouveau() {
  const [state, action, pending] = useActionState(createLead, undefined);

  // Contacts contrôlés : pilotent l'auto-sélection du canal et la validation.
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");

  const [source, setSource] = useState("AUTRE");
  const [sourceTouched, setSourceTouched] = useState(false);
  const [occasion, setOccasion] = useState("");

  // Auto-sélection : un seul contact renseigné → canal déduit ; plusieurs → « Non précisé ».
  // On respecte un choix manuel dès qu'il a eu lieu.
  useEffect(() => {
    if (sourceTouched) return;
    const filled = [
      phone.trim() && "WHATSAPP",
      instagram.trim() && "INSTAGRAM",
      email.trim() && "EMAIL",
      facebook.trim() && "FACEBOOK",
    ].filter(Boolean) as string[];
    setSource(filled.length === 1 ? filled[0] : "AUTRE");
  }, [phone, email, instagram, facebook, sourceTouched]);

  const hasContact = [phone, email, instagram, facebook].some((v) => v.trim());

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold tracking-tight text-zinc-900 sm:text-[22px]">Nouvelle fiche</h1>
      <p className="mb-6 text-sm text-zinc-500">30 secondes, promis — prénom, un contact et le prix suffisent, le reste peut attendre.</p>

      <form action={action} className="max-w-2xl space-y-7 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-7">
        {/* Contact */}
        <section>
          <SectionHeader icon={User} title="Contact" />
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <label><span className={label}>Prénom *</span><input name="firstName" required autoFocus className={input} /></label>
            <label><span className={label}>Nom</span><input name="lastName" className={input} /></label>

            <label>
              <span className={labelRow}><ChannelIcon source="TELEPHONE" className="size-3.5" /> Mobile</span>
              <input name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={input} placeholder="+41…" />
            </label>
            <label>
              <span className={labelRow}><ChannelIcon source="EMAIL" className="size-3.5" /> E-mail</span>
              <input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
            </label>
            <label>
              <span className={labelRow}><ChannelIcon source="INSTAGRAM" className="size-3.5" /> Instagram</span>
              <input name="instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} className={input} placeholder="@…" />
            </label>
            <label>
              <span className={labelRow}><ChannelIcon source="FACEBOOK" className="size-3.5" /> Facebook</span>
              <input name="facebook" value={facebook} onChange={(e) => setFacebook(e.target.value)} className={input} placeholder="Profil / page" />
            </label>
          </div>
        </section>

        {/* Canal */}
        <section>
          <SectionHeader icon={Radio} title="Canal *" hint="comment est arrivée la demande" />
          <input type="hidden" name="source" value={source} />
          <ChannelField value={source} onChange={(s) => { setSource(s); setSourceTouched(true); }} />
          <p className="mt-1.5 text-[12px] text-zinc-400">Déduit automatiquement quand un seul contact est renseigné — modifiable à tout moment.</p>
        </section>

        {/* La demande */}
        <section>
          <SectionHeader icon={Cake} title="La demande" hint="optionnel — peut attendre" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Occasion</span>
              <input type="hidden" name="occasion" value={occasion} />
              <OccasionField value={occasion} onChange={setOccasion} />
            </div>
            <label><span className={label}>Date de l'événement</span><input name="eventDate" type="date" className={input} /></label>
            <label><span className={label}>Prix estimé (CHF) *</span><input name="priceQuoted" type="number" min="0" required className={input} /></label>
            <div className="sm:col-span-2"><TiersParts tiers={null} parts={null} /></div>
            <div className="sm:col-span-2"><DeliveryFields mode="retrait" address="" /></div>
          </div>
        </section>

        {/* Notes */}
        <section>
          <SectionHeader icon={StickyNote} title="Notes" />
          <textarea name="notes" rows={3} className={input} placeholder="Thème, contraintes, contexte de la demande…" />
        </section>

        {state?.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
        {!hasContact && <p className="text-[13px] text-zinc-400">Renseigne au moins un moyen de contact pour créer la fiche.</p>}
        <Button loading={pending} disabled={!hasContact} className="h-11 px-6 text-[15px] font-semibold">Créer la fiche</Button>
      </form>
    </>
  );
}
