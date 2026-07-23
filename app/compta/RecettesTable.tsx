"use client";

/* Encaissements du mois — table triable (Date / Cliente / Type / Montant),
   ligne cliquable vers la fiche commande. Langage aligné sur l'Historique. */

import { useRouter } from "next/navigation";
import { Table, THead, TR, TD, TH, EmptyState } from "@/components/ui/table";
import { useSort, SortableTH } from "@/components/ui/table-kit";
import { PAYKIND_LABEL, PAYKIND_TONE, chf } from "@/lib/money";
import { occasionIcon } from "@/lib/occasions";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/ui";

export type PayRow = {
  id: string;
  orderId: string;
  dateISO: string;
  dateLabel: string;
  name: string;
  orderNo: number | null;
  occasion: string;
  kind: string;
  cents: number;
};

const ACCESSORS = {
  date: (r: PayRow) => r.dateISO,
  name: (r: PayRow) => r.name.toLowerCase(),
  kind: (r: PayRow) => r.kind,
  amount: (r: PayRow) => r.cents,
} as Record<string, (r: PayRow) => string | number | null>;

export default function RecettesTable({ rows }: { rows: PayRow[] }) {
  const router = useRouter();
  const { sorted, sort, toggle } = useSort(rows, { key: "date", dir: "desc" }, ACCESSORS);

  return (
    <Table>
      <THead>
        <tr>
          <SortableTH label="Date" k="date" sort={sort} onToggle={toggle} />
          <SortableTH label="Cliente" k="name" sort={sort} onToggle={toggle} />
          <SortableTH label="Type" k="kind" sort={sort} onToggle={toggle} />
          <SortableTH label="Montant" k="amount" sort={sort} onToggle={toggle} className="text-right" align="right" />
        </tr>
      </THead>
      <tbody>
        {sorted.map((r) => {
          const OccIcon = occasionIcon(r.occasion);
          return (
            <TR key={r.id} className="cursor-pointer even:bg-zinc-50/50" onClick={() => router.push(`/commandes/${r.orderId}`)}>
              <TD className="whitespace-nowrap tabular-nums text-zinc-500">{r.dateLabel}</TD>
              <TD>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <OccIcon className="size-3.5 shrink-0 text-(--color-brand)" />
                  <span className="truncate font-medium text-zinc-900">{r.name}</span>
                  {r.orderNo ? <span className="hidden shrink-0 text-[11px] tabular-nums text-zinc-300 sm:inline">#{String(r.orderNo).padStart(4, "0")}</span> : null}
                </span>
              </TD>
              <TD>
                <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", PAYKIND_TONE[r.kind] ?? "bg-zinc-100 text-zinc-600")}>
                  {PAYKIND_LABEL[r.kind] ?? r.kind}
                </span>
              </TD>
              <TD className={cn("whitespace-nowrap text-right font-semibold tabular-nums", r.cents < 0 ? "text-red-700" : "text-zinc-900")}>{chf(r.cents)}</TD>
            </TR>
          );
        })}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={4}>
              <EmptyState icon={<Wallet />} title="Aucun encaissement ce mois-ci" hint="Les paiements reçus apparaîtront ici, à leur date." />
            </td>
          </tr>
        )}
      </tbody>
    </Table>
  );
}
