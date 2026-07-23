"use client";

/* Contacts — mêmes interactions que l'Historique.
   Clic/tap sur une ligne → ouvre la fiche contact. Appui long (~0,5 s) → entre
   en mode sélection et coche la ligne ; ensuite un tap coche/décoche. Le scroll
   (doigt qui bouge) annule l'appui long. Ctrl/Cmd+clic sélectionne directement.
   Recherche live sur toutes les données (contact + historique de commandes),
   actions groupées (export / fusion / suppression) + menu ⋮ par ligne. */

import { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Trash2, Users, Check, CheckCheck, Download, GitMerge } from "lucide-react";
import { deleteContact, deleteManyContacts } from "@/app/actions";
import { downloadCSV } from "@/components/ui/table-kit";
import { SelectionBar, SelectionAction } from "@/components/ui/selection-bar";
import MergeDialog from "./MergeDialog";
import { avatar, cn } from "@/lib/ui";
import { Table, THead, TR, TD, TH, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChannelIcon } from "@/components/ui/channel-icon";
import { occasionIcon, occasionShort } from "@/lib/occasions";
import { useSort, SortableTH, RowMenu, useConfirm } from "@/components/ui/table-kit";

const fieldCls = "h-9 rounded-lg border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-(--color-brand)";

export type Row = {
  id: string;
  name: string;
  phone: string;
  email: string;
  instagram: string;
  sourceId: string; // canal d'acquisition (enum Source)
  orderId: string | null;
  occasion: string; // dernière occasion
  dateLabel: string;
  dateISO: string | null;
  totalCents: number; // encaissé réel cumulé (acomptes + soldes + pourboires)
  ordersCount: number;
  search: string; // index de recherche (contact + toutes ses commandes)
};

const ACCESSORS = {
  name: (r: Row) => r.name.toLowerCase(),
  date: (r: Row) => r.dateISO,
  total: (r: Row) => r.totalCents,
  orders: (r: Row) => r.ordersCount,
} as Record<string, (r: Row) => string | number | null>;

export default function ContactsTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [merging, setMerging] = useState(false);
  const { confirm, node } = useConfirm();

  // Recherche live multi-mots : tous les mots doivent matcher l'index.
  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return rows;
    return rows.filter((r) => tokens.every((t) => r.search.includes(t)));
  }, [rows, query]);

  const { sorted, sort, toggle } = useSort(filtered, { key: "date", dir: "desc" }, ACCESSORS);

  const count = useMemo(() => rows.reduce((n, r) => n + (sel[r.id] ? 1 : 0), 0), [rows, sel]);
  const selMode = count > 0;
  const selected = rows.filter((r) => sel[r.id]);

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
    router.push(`/contacts/${id}`);
  };

  return (
    <div>
      {node}
      {merging && selected.length === 2 && <MergeDialog a={selected[0]} b={selected[1]} onClose={() => { setMerging(false); setSel({}); }} />}

      {/* Recherche live pleine largeur */}
      <div className="mb-3 space-y-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher (nom, téléphone, e-mail, occasion, thème, notes…)"
          className={cn(fieldCls, "w-full")}
        />
        {query && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setQuery("")} className="text-sm text-zinc-400 transition-colors hover:text-zinc-700">
              Réinitialiser
            </button>
            <span className="ml-auto text-xs text-zinc-400">{sorted.length} fiche{sorted.length > 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      <SelectionBar count={count} label={count > 1 ? "fiches" : "fiche"} onClear={() => setSel({})}>
        <SelectionAction icon={<CheckCheck />} label="Tout sélectionner" onClick={() => setSel(Object.fromEntries(sorted.map((r) => [r.id, true])))} />
        <SelectionAction
          icon={<Download />}
          label="Exporter en CSV"
          onClick={() =>
            downloadCSV(
              `contacts-${new Date().toISOString().slice(0, 10)}.csv`,
              ["nom", "telephone", "email", "instagram", "commandes"],
              selected.map((r) => [r.name, r.phone, r.email, r.instagram, r.ordersCount])
            )
          }
        />
        <SelectionAction icon={<GitMerge />} label="Fusionner (sélectionne exactement 2 fiches)" disabled={count !== 2} onClick={() => setMerging(true)} />
        <SelectionAction
          icon={<Trash2 />}
          label="Supprimer"
          destructive
          onClick={() =>
            confirm({
              title: `Supprimer ${count} fiche${count > 1 ? "s" : ""}`,
              desc: "Leurs commandes seront supprimées aussi. Définitif.",
              confirmLabel: "Supprimer",
              action: async () => {
                await deleteManyContacts(selected.map((r) => r.id));
                setSel({});
                router.refresh();
              },
            })
          }
        />
      </SelectionBar>

      <Table>
        <THead>
          <tr>
            <SortableTH label="Nom" k="name" sort={sort} onToggle={toggle} />
            <TH className="w-8" aria-label="Canal" />
            <TH>Mobile</TH>
            <TH>Dernière occasion</TH>
            <SortableTH label="Date" k="date" sort={sort} onToggle={toggle} />
            <SortableTH label="Commandes" k="orders" sort={sort} onToggle={toggle} className="text-right" align="right" />
            <SortableTH label="Total" k="total" sort={sort} onToggle={toggle} className="text-right" align="right" />
            <TH className="w-10" />
          </tr>
        </THead>
        <tbody>
          {sorted.map((r) => {
            const av = avatar(r.name);
            const OccIcon = occasionIcon(r.occasion);
            return (
              <TR
                key={r.id}
                className={cn("cursor-pointer select-none", sel[r.id] ? "bg-(--color-brand-soft) even:bg-(--color-brand-soft) hover:bg-(--color-brand-soft)" : "even:bg-zinc-50/50")}
                onClick={(e) => onRowClick(e, r.id)}
                onPointerDown={(e) => onPointerDown(e, r.id)}
                onPointerMove={onPointerMove}
                onPointerUp={clearPress}
                onPointerLeave={clearPress}
                onPointerCancel={clearPress}
              >
                <TD>
                  <span className="flex items-center gap-2.5 font-medium text-zinc-900">
                    {selMode ? (
                      <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors", sel[r.id] ? "border-(--color-brand) bg-(--color-brand) text-white" : "border-zinc-300 bg-white")}>
                        {sel[r.id] && <Check className="size-3" />}
                      </span>
                    ) : (
                      <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${av.color}`}>{av.initials}</span>
                    )}
                    {r.name}
                  </span>
                </TD>
                <TD className="w-8">
                  <ChannelIcon source={r.sourceId} className="size-4" />
                </TD>
                <TD className="whitespace-nowrap tabular-nums text-zinc-600">{r.phone || "—"}</TD>
                <TD className="max-w-[220px]">
                  {r.occasion ? (
                    <span className="inline-flex items-center gap-1.5 text-zinc-700">
                      <OccIcon className="size-3.5 shrink-0 text-(--color-brand)" />
                      <span className="truncate">{occasionShort(r.occasion)}</span>
                    </span>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </TD>
                <TD className="whitespace-nowrap tabular-nums text-zinc-500">{r.dateLabel}</TD>
                <TD className="text-right"><Badge variant="outline">{r.ordersCount}</Badge></TD>
                <TD className="text-right font-medium tabular-nums text-zinc-900">
                  {r.totalCents > 0 ? `CHF ${(r.totalCents / 100) % 1 ? (r.totalCents / 100).toFixed(2) : r.totalCents / 100}` : "—"}
                </TD>
                <TD className="w-10" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                  <RowMenu
                    actions={[
                      { label: "Ouvrir la fiche", icon: <ExternalLink />, href: `/contacts/${r.id}` },
                      ...(r.orderId ? [{ label: "Dernière commande", icon: <ExternalLink />, href: `/commandes/${r.orderId}` }] : []),
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
              <td colSpan={8}>
                <EmptyState icon={<Users />} title={query ? "Aucun contact ne correspond" : "Aucun contact"} hint={query ? "Essaie un autre terme." : "Crée ta première fiche ou importe ton historique."} />
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
