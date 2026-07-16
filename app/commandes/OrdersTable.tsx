"use client";

/* Table de l'historique — tri par colonne, sélection multiple (« payé en
   entier » en lot, pratique pour solder l'import), menu d'actions par ligne. */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { markManyPaidInFull, duplicateOrder, deleteOrder } from "@/app/actions";
import { Table, THead, TR, TD, TH, EmptyState } from "@/components/ui/table";
import { Badge, STATUS_BADGE } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSort, SortableTH, RowMenu, useConfirm } from "@/components/ui/table-kit";
import { Archive } from "lucide-react";

export type Row = {
  id: string;
  name: string;
  occasion: string;
  date: string;
  dateISO: string | null;
  status: string;
  source: string;
  amount: string;
  amountCents: number;
  due: string | null;
};

const ACCESSORS = {
  date: (r: Row) => r.dateISO,
  name: (r: Row) => r.name.toLowerCase(),
  occasion: (r: Row) => (r.occasion === "—" ? null : r.occasion.toLowerCase()),
  status: (r: Row) => r.status,
  amount: (r: Row) => r.amountCents,
} as Record<string, (r: Row) => string | number | null>;

export default function OrdersTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const { sorted, sort, toggle } = useSort(rows, { key: "date", dir: "desc" }, ACCESSORS);
  const { confirm, node } = useConfirm();

  const count = useMemo(() => rows.reduce((n, r) => n + (sel[r.id] ? 1 : 0), 0), [rows, sel]);
  const allChecked = rows.length > 0 && count === rows.length;
  const toggleAll = () => setSel(allChecked ? {} : Object.fromEntries(rows.map((r) => [r.id, true])));

  return (
    <form action={markManyPaidInFull}>
      {node}
      {count > 0 && (
        <div className="sticky top-14 z-10 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-(--color-line) bg-(--color-brand-soft) px-4 py-2">
          <span className="text-[13px] font-medium text-zinc-800">
            {count} commande{count > 1 ? "s" : ""} sélectionnée{count > 1 ? "s" : ""}
          </span>
          <Button size="sm">Marquer payé en entier</Button>
        </div>
      )}
      <Table>
        <THead>
          <tr>
            <TH className="w-10">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Tout sélectionner" className="size-4 accent-(--color-brand)" />
            </TH>
            <SortableTH label="Événement" k="date" sort={sort} onToggle={toggle} />
            <SortableTH label="Cliente" k="name" sort={sort} onToggle={toggle} />
            <SortableTH label="Occasion" k="occasion" sort={sort} onToggle={toggle} />
            <SortableTH label="Statut" k="status" sort={sort} onToggle={toggle} />
            <SortableTH label="Montant" k="amount" sort={sort} onToggle={toggle} className="text-right" align="right" />
            <TH className="w-10" />
          </tr>
        </THead>
        <tbody>
          {sorted.map((r) => {
            const b = STATUS_BADGE[r.status] ?? STATUS_BADGE.LEAD;
            return (
              <TR key={r.id}>
                <TD className="w-10">
                  <input
                    type="checkbox"
                    name="ids"
                    value={r.id}
                    checked={!!sel[r.id]}
                    onChange={(e) => setSel((s) => ({ ...s, [r.id]: e.target.checked }))}
                    className="size-4 accent-(--color-brand)"
                  />
                </TD>
                <TD className="whitespace-nowrap tabular-nums text-zinc-500">{r.date}</TD>
                <TD>
                  <Link href={`/commandes/${r.id}`} className="font-medium text-zinc-900 hover:underline">{r.name}</Link>
                  {r.source ? <span className="ml-1.5 text-xs text-zinc-400">{r.source}</span> : null}
                </TD>
                <TD>{r.occasion}</TD>
                <TD><Badge variant={b.variant}>{b.label}</Badge></TD>
                <TD className="whitespace-nowrap text-right">
                  <span className="font-medium tabular-nums text-zinc-900">{r.amount}</span>
                  {r.due && <Badge variant="warning" className="ml-1.5">reste {r.due}</Badge>}
                </TD>
                <TD className="w-10">
                  <RowMenu
                    actions={[
                      { label: "Ouvrir la fiche", icon: <ExternalLink />, href: `/commandes/${r.id}` },
                      {
                        label: "Dupliquer",
                        icon: <Copy />,
                        onSelect: async () => {
                          const res = await duplicateOrder(r.id);
                          if (res.error) toast.error(res.error);
                          else {
                            toast.success("Commande dupliquée (nouveau lead).");
                            if (res.id) router.push(`/commandes/${res.id}`);
                          }
                        },
                      },
                      {
                        label: "Supprimer",
                        icon: <Trash2 />,
                        destructive: true,
                        separatorBefore: true,
                        onSelect: () =>
                          confirm({
                            title: `Supprimer la commande de ${r.name}`,
                            desc: "La fiche, son historique et ses relances disparaissent. Cette action est définitive.",
                            confirmLabel: "Supprimer",
                            action: async () => {
                              await deleteOrder(r.id);
                              router.refresh();
                            },
                          }),
                      },
                    ]}
                  />
                </TD>
              </TR>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7}>
                <EmptyState icon={<Archive />} title="Aucune commande ne correspond" hint="Élargis la période ou réinitialise les filtres." />
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </form>
  );
}
