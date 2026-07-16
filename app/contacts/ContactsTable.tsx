"use client";

/* Contacts — recherche instantanée, tri par colonne, actions par ligne. */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ExternalLink, Trash2, Users } from "lucide-react";
import { deleteContact } from "@/app/actions";
import { avatar } from "@/lib/ui";
import { Table, THead, TR, TD, TH, EmptyState } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSort, SortableTH, RowMenu, useConfirm } from "@/components/ui/table-kit";

export type Row = {
  id: string;
  name: string;
  phone: string;
  sourceLabel: string;
  orderId: string | null;
  occasion: string;
  dateLabel: string;
  dateISO: string | null;
  price: number | null;
  ordersCount: number;
};

const ACCESSORS = {
  name: (r: Row) => r.name.toLowerCase(),
  date: (r: Row) => r.dateISO,
  price: (r: Row) => r.price,
  orders: (r: Row) => r.ordersCount,
} as Record<string, (r: Row) => string | number | null>;

export default function ContactsTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const { confirm, node } = useConfirm();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(needle) || r.phone.replace(/\s/g, "").includes(needle.replace(/\s/g, "")) || r.occasion.toLowerCase().includes(needle));
  }, [rows, q]);

  const { sorted, sort, toggle } = useSort(filtered, { key: "date", dir: "desc" }, ACCESSORS);

  return (
    <div>
      {node}
      <div className="relative mb-3 max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, mobile, occasion…" className="h-8 pl-8 text-[13px]" />
      </div>
      <Table>
        <THead>
          <tr>
            <SortableTH label="Nom" k="name" sort={sort} onToggle={toggle} />
            <TH>Mobile</TH>
            <TH>Dernière occasion</TH>
            <SortableTH label="Date" k="date" sort={sort} onToggle={toggle} />
            <SortableTH label="Commandes" k="orders" sort={sort} onToggle={toggle} className="text-right" align="right" />
            <SortableTH label="Prix" k="price" sort={sort} onToggle={toggle} className="text-right" align="right" />
            <TH className="w-10" />
          </tr>
        </THead>
        <tbody>
          {sorted.map((r) => {
            const av = avatar(r.name);
            return (
              <TR key={r.id}>
                <TD>
                  <Link href={`/contacts/${r.id}`} className="flex items-center gap-2.5 font-medium text-zinc-900 hover:underline">
                    <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${av.color}`}>{av.initials}</span>
                    {r.name}
                  </Link>
                </TD>
                <TD className="whitespace-nowrap tabular-nums">{r.phone || "—"}</TD>
                <TD className="max-w-[240px]">
                  {r.orderId ? (
                    <Link href={`/commandes/${r.orderId}`} className="block truncate hover:underline" title={r.occasion}>{r.occasion || "—"}</Link>
                  ) : ("—")}
                  {r.sourceLabel ? <span className="ml-0 block text-xs text-zinc-400">{r.sourceLabel}</span> : null}
                </TD>
                <TD className="whitespace-nowrap tabular-nums text-zinc-500">{r.dateLabel}</TD>
                <TD className="text-right"><Badge variant="outline">{r.ordersCount}</Badge></TD>
                <TD className="text-right font-medium tabular-nums text-zinc-900">{r.price ? `CHF ${r.price}` : "—"}</TD>
                <TD className="w-10">
                  <RowMenu
                    actions={[
                      { label: "Ouvrir la fiche", icon: <ExternalLink />, href: `/contacts/${r.id}` },
                      {
                        label: "Supprimer",
                        icon: <Trash2 />,
                        destructive: true,
                        separatorBefore: true,
                        onSelect: () =>
                          confirm({
                            title: `Supprimer ${r.name}`,
                            desc: r.ordersCount > 0 ? `Cette fiche a ${r.ordersCount} commande${r.ordersCount > 1 ? "s" : ""} — elles seront supprimées aussi. Définitif.` : "Cette action est définitive.",
                            confirmLabel: "Supprimer",
                            action: async () => {
                              await deleteContact(r.id);
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
          {sorted.length === 0 && (
            <tr>
              <td colSpan={7}>
                <EmptyState icon={<Users />} title={q ? "Aucun contact ne correspond" : "Aucun contact"} hint={q ? "Essaie un autre terme." : "Crée ta première fiche ou importe ton historique."} />
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
