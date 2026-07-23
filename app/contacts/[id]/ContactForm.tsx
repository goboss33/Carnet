"use client";

/* Fiche contact — auto-save (mêmes briques que la fiche commande : débounce +
   témoin flottant). Canaux complets avec icônes, champ Facebook, newsletter en
   interrupteur, suppression en action discrète. */

import { useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { updateContact, deleteContact } from "@/app/actions";
import { AutoSaveForm } from "@/app/commandes/[id]/AutoSave";
import { SOURCES } from "@/lib/statuts";
import { ChannelIcon } from "@/components/ui/channel-icon";
import { cn, setNativeInputValue } from "@/lib/ui";

const input = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500";
const labelRow = "mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

/* Canal avec icônes : un <select> natif ne peut pas en afficher → menu custom.
   Input caché + événement natif « change » pour que l'auto-save le capte. */
function ChannelSelect({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const hidden = useRef<HTMLInputElement>(null);
  const cur = SOURCES.find((s) => s.id === value) ?? SOURCES[SOURCES.length - 1];
  const choose = (id: string) => {
    setValue(id);
    setOpen(false);
    if (hidden.current) setNativeInputValue(hidden.current, id); // setter natif → l'auto-save capte bien l'événement
  };
  return (
    <div className="relative">
      <input ref={hidden} type="hidden" name="source" defaultValue={initial} />
      <button type="button" onClick={() => setOpen((v) => !v)} className={cn(input, "flex items-center gap-2 text-left")}>
        <span className="flex size-4 shrink-0 items-center justify-center"><ChannelIcon source={cur.id} className="size-4" /></span>
        <span className="flex-1">{cur.label}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => choose(s.id)}
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

type C = {
  id: string; firstName: string; lastName: string; phone: string; email: string;
  instagram: string; facebook: string; source: string; notes: string; consentNewsletter: boolean;
};

export default function ContactForm({ contact, ordersCount }: { contact: C; ordersCount: number }) {
  const save = async (fd: FormData) => {
    const r = await updateContact(contact.id, undefined, fd);
    if (r && "error" in r && r.error) throw new Error(r.error);
  };
  const confirmDelete = (e: React.FormEvent) => {
    const msg =
      ordersCount > 0
        ? `Supprimer ${contact.firstName} ET ses ${ordersCount} commande(s) ? C'est définitif.`
        : `Supprimer ${contact.firstName} ? C'est définitif.`;
    if (!window.confirm(msg)) e.preventDefault();
  };

  return (
    <AutoSaveForm action={save} className="space-y-4 self-start rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
      <div className="grid grid-cols-2 gap-3">
        <label><span className={label}>Prénom *</span><input name="firstName" defaultValue={contact.firstName} required className={input} /></label>
        <label><span className={label}>Nom</span><input name="lastName" defaultValue={contact.lastName} className={input} /></label>
        <label>
          <span className={labelRow}><ChannelIcon source="TELEPHONE" className="size-3.5" /> Mobile</span>
          <input name="phone" defaultValue={contact.phone} className={input} placeholder="+41…" />
        </label>
        <label>
          <span className={labelRow}><ChannelIcon source="EMAIL" className="size-3.5" /> E-mail</span>
          <input name="email" type="email" defaultValue={contact.email} className={input} />
        </label>
        <label>
          <span className={labelRow}><ChannelIcon source="INSTAGRAM" className="size-3.5" /> Instagram</span>
          <input name="instagram" defaultValue={contact.instagram} className={input} placeholder="@…" />
        </label>
        <label>
          <span className={labelRow}><ChannelIcon source="FACEBOOK" className="size-3.5" /> Facebook</span>
          <input name="facebook" defaultValue={contact.facebook} className={input} placeholder="Profil / page" />
        </label>
      </div>

      <div>
        <span className={label}>Canal d'origine</span>
        <ChannelSelect initial={contact.source} />
      </div>

      <label className="block"><span className={label}>Notes</span><textarea name="notes" rows={3} defaultValue={contact.notes} className={input} placeholder="Allergies, préférences, contexte…" /></label>

      <label className="flex cursor-pointer items-center gap-2.5" title="Accepte de recevoir les nouvelles">
        <input type="checkbox" name="consentNewsletter" defaultChecked={contact.consentNewsletter} className="peer sr-only" />
        <span className="relative h-5 w-9 shrink-0 rounded-full bg-zinc-200 transition-colors peer-checked:bg-(--color-brand) after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" />
        <span className="text-[13px] font-medium text-zinc-600">OK pour la newsletter</span>
      </label>

      <div className="flex justify-end border-t border-zinc-100 pt-3">
        <button
          formAction={deleteContact.bind(null, contact.id)}
          onClick={confirmDelete}
          title="Supprimer définitivement (avec ses commandes)"
          className="text-[13px] text-zinc-400 transition-colors hover:text-red-600"
        >
          Supprimer la fiche{ordersCount > 0 ? ` (+${ordersCount} commande${ordersCount > 1 ? "s" : ""})` : ""}
        </button>
      </div>
    </AutoSaveForm>
  );
}
