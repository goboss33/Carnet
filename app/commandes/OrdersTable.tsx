"use client";

/* Table de l'historique.
   Interaction : clic/tap sur une ligne → ouvre la fiche. Appui long (~0,5 s) →
   entre en mode sélection et coche la ligne ; ensuite un tap coche/décoche.
   Le scroll horizontal (doigt qui bouge) annule l'appui long. Ctrl/Cmd+clic
   sélectionne directement (desktop). Actions groupées + menu ⋮ par ligne. */

import { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Copy, Trash2, Check, Download, PackageCheck, Archive } from "lucide-react";
import { toast } from "sonner";
import { markManyPaidInFull, duplicateOrder, deleteOrder, markManyDelivered, deleteManyOrders } from "@/app/actions";
import { downloadCSV } from "@/components/ui/table-kit";
import { Table, THead, TR, TD, TH, EmptyState } from "@/components/ui/table";
import { Badge, STATUS_BADGE } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSort, SortableTH, RowMenu, useConfirm } from "@/components/ui/table-kit";
import { cn } from "@/lib/ui";

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
  const selMode = count > 0;
  const chosenIds = () => rows.filter((r) => sel[r.id]).map((r) => r.id);

  // ------- appui long + désambiguïsation du scroll --------
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const suppressRef = useRef(false); // supprime le clic qui suit un appui long
  const clearPress = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } startRef.current = null; };
  useEffect(() => () => clearPress(), []);

  const onPointerDown = (e: React.PointerEvent<HTMLTableRowElement>, id: string) => {
    if (e.button !== 0) return; // ignore clic droit/milieu
    suppressRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      suppressRef.current = true;
      setSel((s) => ({ ...s, [id]: true }));
    }, 500);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLTableRowElement>) => {
    if (!startRef.current || !timerRef.current) return;
    if (Math.abs(e.clientX - startRef.current.x) > 10 || Math.abs(e.clientY - startRef.current.y) > 10) clearPress();
  };
  const onRowClick = (e: React.MouseEvent<HTMLTableRowElement>, id: string) => {
    if (suppressRef.current) { suppressRef.current = false; return; } // clic issu d'un appui long
    if (selMode || e.ctrlKey || e.metaKey) { setSel((s) => ({ ...s, [id]: !s[id] })); return; }
    router.push(`/commandes/${id}`);
  };

  return (
    <div>
      {node}
      {selMode && (
        <div className="sticky top-14 z-10 mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-(--color-line) bg-(--color-brand-soft) px-4 py-2 md:top-0">
          <span className="text-[13px] font-medium text-zinc-800">
            {count} sélectionnée{count > 1 ? "s" : ""}
          </span>
          <button type="button" onClick={() => setSel(Object.fromEntries(rows.map((r) => [r.id, true])))} className="text-[13px] font-medium text-(--color-brand) hover:underline">
            Tout sélectionner
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              type="button" size="sm" variant="outline"
              onClick={() => {
                const chosen = rows.filter((r) => sel[r.id]);
                downloadCSV(
                  `commandes-selection-${new Date().toISOString().slice(0, 10)}.csv`,
                  ["date_evenement", "cliente", "occasion", "statut", "montant_chf"],
                  chosen.map((r) => [r.dateISO?.slice(0, 10) ?? "", r.name, r.occasion, STATUS_BADGE[r.status]?.label ?? r.status, r.amountCents])
                );
              }}
            >
              <Download /> Export CSV
            </Button>
            <Button
              type="button" size="sm" variant="outline"
              onClick={() =>
                confirm({
                  title: `Marquer ${count} commande${count > 1 ? "s" : ""} livrée${count > 1 ? "s" : ""}`,
                  desc: "Horodate la livraison (les demandes d'avis suivront pour les fiches éligibles).",
                  confirmLabel: "Marquer livrées",
                  action: async () => { await markManyDelivered(chosenIds()); setSel({}); router.refresh(); },
                })
              }
            >
              <PackageCheck /> Livrées
            </Button>
            <Button
              type="button" size="sm"
              onClick={async () => {
                const ids = chosenIds();
                const fd = new FormData();
                ids.forEach((id) => fd.append("ids", id));
                await markManyPaidInFull(fd);
                setSel({});
                router.refresh();
                toast.success(`${ids.length} commande${ids.length > 1 ? "s" : ""} marquée${ids.length > 1 ? "s" : ""} payée${ids.length > 1 ? "s" : ""}.`);
              }}
            >
              Payé en entier
            </Button>
            <Button
              type="button" size="sm" variant="destructive-outline"
              onClick={() =>
                confirm({
                  title: `Supprimer ${count} commande${count > 1 ? "s" : ""}`,
                  desc: "Fiches, historiques et relances disparaissent. Définitif.",
                  confirmLabel: "Supprimer",
                  action: async () => { await deleteManyOrders(chosenIds()); setSel({}); router.refresh(); },
                })
              }
            >
              Supprimer
            </Button>
            <button type="button" onClick={() => setSel({})} className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-zinc-500 transition-colors hover:bg-white hover:text-zinc-800">
              Terminé
            </button>
          </div>
        </div>
      )}

      <Table>
        <THead>
          <tr>
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
              <TR
                key={r.id}
                className={cn("cursor-pointer select-none", sel[r.id] && "bg-(--color-brand-soft) hover:bg-(--color-brand-soft)")}
                onClick={(e) => onRowClick(e, r.id)}
                onPointerDown={(e) => onPointerDown(e, r.id)}
                onPointerMove={onPointerMove}
                onPointerUp={clearPress}
                onPointerLeave={clearPress}
                onPointerCancel={clearPress}
              >
                <TD className="whitespace-nowrap tabular-nums text-zinc-500">
                  <span className="flex items-center gap-2">
                    {selMode && (
                      <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors", sel[r.id] ? "border-(--color-brand) bg-(--color-brand) text-white" : "border-zinc-300 bg-white")}>
                        {sel[r.id] && <Check className="size-3" />}
                      </span>
                    )}
                    {r.date}
                  </span>
                </TD>
                <TD>
                  <span className="font-medium text-zinc-900">{r.name}</span>
                  {r.source ? <span className="ml-1.5 text-xs text-zinc-400">{r.source}</span> : null}
                </TD>
                <TD>{r.occasion}</TD>
                <TD><Badge variant={b.variant}>{b.label}</Badge></TD>
                <TD className="whitespace-nowrap text-right">
                  <span className="font-medium tabular-nums text-zinc-900">{r.amount}</span>
                  {r.due && <Badge variant="warning" className="ml-1.5">reste {r.due}</Badge>}
                </TD>
                <TD className="w-10" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
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
                            action: async () => { await deleteOrder(r.id); router.refresh(); },
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
              <td colSpan={6}>
                <EmptyState icon={<Archive />} title="Aucune commande ne correspond" hint="Élargis la période ou réinitialise les filtres." />
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
