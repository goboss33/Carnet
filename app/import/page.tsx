"use client";

import { useActionState } from "react";
import { importCsv, purgeCrm } from "@/app/actions";
import ShellClient from "@/app/components/ShellClient";

export default function ImportPage() {
  const [state, action, pending] = useActionState(importCsv, undefined);
  const [purgeState, purgeAction, purging] = useActionState(purgeCrm, undefined);
  return (
    <ShellClient>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Importer l'historique</h1>
      <p className="mb-6 max-w-2xl text-sm text-stone-500">
        Remplis le modèle CSV (une ligne par commande : prénom, occasion, dates, prix…), puis
        dépose-le ici. Les contacts existants (même téléphone ou e-mail) sont réutilisés, les
        commandes livrées depuis plus de 7 jours ne déclenchent pas la demande d'avis.
      </p>
      <form action={action} className="max-w-xl space-y-4 rounded-2xl border border-stone-200 bg-white p-7">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          className="block w-full text-sm text-stone-600 file:mr-4 file:rounded-lg file:border-0 file:bg-stone-900 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-stone-700"
        />
        <p className="text-xs text-stone-400">
          Colonnes attendues : prenom;nom;telephone;email;occasion;date_evenement;parts;prix_chf;statut;date_livraison;notes
          — dates au format JJ.MM.AAAA, statut par défaut LIVRE. Le modèle est dans docs/import-modele.csv du repo.
        </p>
        {state?.report && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{state.report}</p>}
        {state?.error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{state.error}</p>}
        <button disabled={pending} className="rounded-lg bg-stone-900 px-6 py-2.5 font-semibold text-white hover:bg-stone-700 disabled:opacity-50">
          {pending ? "Import en cours…" : "Importer"}
        </button>
      </form>

      <details className="mt-8 max-w-xl rounded-2xl border border-red-200 bg-red-50/50 p-6">
        <summary className="cursor-pointer text-sm font-bold text-red-700">
          ⚠️ Zone dangereuse — vider commandes & contacts
        </summary>
        <p className="mt-3 text-sm text-red-800/80">
          Supprime <b>toutes</b> les commandes et <b>tous</b> les contacts (les dépenses et
          partenaires ne sont pas touchés). Utile pour repartir propre avant un réimport.
        </p>
        <form action={purgeAction} className="mt-4 flex flex-wrap items-center gap-2">
          <input
            name="confirm"
            placeholder="Tape SUPPRIMER"
            className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500"
          />
          <button disabled={purging} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {purging ? "…" : "Tout supprimer"}
          </button>
        </form>
        {purgeState?.report && <p className="mt-3 text-sm font-medium text-emerald-700">{purgeState.report}</p>}
        {purgeState?.error && <p className="mt-3 text-sm font-medium text-red-700">{purgeState.error}</p>}
      </details>
    </ShellClient>
  );
}
