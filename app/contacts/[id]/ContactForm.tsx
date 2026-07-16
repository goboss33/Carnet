"use client";

import { useActionState } from "react";
import { updateContact, deleteContact } from "@/app/actions";

const input = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

type C = {
  id: string; firstName: string; lastName: string; phone: string; email: string;
  instagram: string; source: string; notes: string; consentNewsletter: boolean;
};

export default function ContactForm({ contact, ordersCount }: { contact: C; ordersCount: number }) {
  const [state, action, pending] = useActionState(updateContact.bind(null, contact.id), undefined);
  const confirmDelete = (e: React.FormEvent) => {
    const msg =
      ordersCount > 0
        ? `Supprimer ${contact.firstName} ET ses ${ordersCount} commande(s) ? C'est définitif.`
        : `Supprimer ${contact.firstName} ? C'est définitif.`;
    if (!window.confirm(msg)) e.preventDefault();
  };
  return (
    <form action={action} className="space-y-4 self-start rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className={label}>Prénom *</span><input name="firstName" defaultValue={contact.firstName} required className={input} /></label>
        <label><span className={label}>Nom</span><input name="lastName" defaultValue={contact.lastName} className={input} /></label>
        <label><span className={label}>Mobile</span><input name="phone" defaultValue={contact.phone} className={input} /></label>
        <label><span className={label}>E-mail</span><input name="email" defaultValue={contact.email} className={input} /></label>
        <label><span className={label}>Instagram</span><input name="instagram" defaultValue={contact.instagram} className={input} /></label>
        <label>
          <span className={label}>Canal d'origine</span>
          <select name="source" defaultValue={contact.source} className={input}>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="TELEPHONE">Téléphone</option>
            <option value="CONFIGURATEUR">Site</option>
            <option value="AUTRE">Autre</option>
          </select>
        </label>
      </div>
      <label><span className={label}>Notes</span><textarea name="notes" rows={3} defaultValue={contact.notes} className={input} /></label>
      <label className="flex items-center gap-2 text-sm text-zinc-600">
        <input type="checkbox" name="consentNewsletter" defaultChecked={contact.consentNewsletter} className="h-4 w-4 accent-(--color-brand)" />
        OK pour recevoir les nouvelles (newsletter)
      </label>
      {state?.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm font-medium text-emerald-700">Enregistré ✓</p>}
      <div className="flex items-center justify-between">
        <button disabled={pending} className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50">
          {pending ? "…" : "Enregistrer"}
        </button>
        <button
          formAction={deleteContact.bind(null, contact.id)}
          onClick={confirmDelete}
          title="Supprimer définitivement (avec ses commandes)"
          className="text-sm text-zinc-400 hover:text-red-600"
        >
          Supprimer{ordersCount > 0 ? ` (+${ordersCount} cmd)` : ""}
        </button>
      </div>
    </form>
  );
}
