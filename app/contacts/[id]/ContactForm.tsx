"use client";

/* Fiche contact — auto-save (mêmes briques que la fiche commande : débounce +
   témoin flottant). Canaux complets avec icônes, champ Facebook, newsletter en
   interrupteur, suppression en action discrète. */

import { updateContact, deleteContact } from "@/app/actions";
import { AutoSaveForm } from "@/app/commandes/[id]/AutoSave";
import { SOURCES } from "@/lib/statuts";
import { ChannelIcon } from "@/components/ui/channel-icon";

const input = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500";
const labelRow = "mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

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

      <label className="block">
        <span className={label}>Canal d'origine</span>
        <select name="source" defaultValue={contact.source} className={input}>
          {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>

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
