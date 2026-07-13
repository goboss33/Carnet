"use client";

/* Table de l'historique avec sélection multiple → « payé en entier » en lot.
   Pratique pour solder d'un coup les commandes importées (toutes marquées
   « reste à encaisser » faute d'info de paiement à l'import). */

import Link from "next/link";
import { useState } from "react";
import { markManyPaidInFull } from "@/app/actions";

export type Row = {
  id: string;
  name: string;
  occasion: string;
  date: string;
  statusLabel: string;
  statusCls: string;
  source: string;
  amount: string;
  due: string | null;
};

export default function OrdersTable({ rows }: { rows: Row[] }) {
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const count = rows.reduce((n, r) => n + (sel[r.id] ? 1 : 0), 0);
  const allChecked = rows.length > 0 && count === rows.length;

  const toggleAll = () =>
    setSel(allChecked ? {} : Object.fromEntries(rows.map((r) => [r.id, true])));

  return (
    <form action={markManyPaidInFull}>
      {count > 0 && (
        <div className="sticky top-14 z-10 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5">
          <span className="text-sm font-semibold text-amber-800">
            {count} commande{count > 1 ? "s" : ""} sélectionnée{count > 1 ? "s" : ""}
          </span>
          <button className="rounded-lg bg-stone-900 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-stone-700">
            💯 Marquer payé en entier
          </button>
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-[11px] uppercase tracking-wider text-stone-500">
            <tr>
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label="Tout sélectionner"
                  className="h-4 w-4 accent-stone-900"
                />
              </th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Occasion</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3 text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    name="ids"
                    value={r.id}
                    checked={!!sel[r.id]}
                    onChange={(e) => setSel((s) => ({ ...s, [r.id]: e.target.checked }))}
                    className="h-4 w-4 accent-stone-900"
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-stone-500">{r.date}</td>
                <td className="px-4 py-2.5">
                  <Link href={`/commandes/${r.id}`} className="font-semibold hover:underline">{r.name}</Link>
                  <span className="ml-1.5 text-xs text-stone-400">{r.source}</span>
                </td>
                <td className="px-4 py-2.5 text-stone-600">{r.occasion}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${r.statusCls}`}>{r.statusLabel}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  <span className="font-semibold">{r.amount}</span>
                  {r.due && (
                    <span className="ml-1.5 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-semibold text-amber-700">reste {r.due}</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-stone-400">Aucune commande ne correspond.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </form>
  );
}
