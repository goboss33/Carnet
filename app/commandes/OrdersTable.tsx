"use client";

/* Table de l'historique.
   Interaction : clic/tap sur une ligne → ouvre la fiche. Appui long (~0,5 s) →
   entre en mode sélection et coche la ligne ; ensuite un tap coche/décoche.
   Le scroll horizontal (doigt qui bouge) annule l'appui long. Ctrl/Cmd+clic
   sélectionne directement (desktop). Actions groupées + menu ⋮ par ligne. */

import { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Copy, Trash2, Check, CheckCheck, Download, PackageCheck, Banknote, Archive } from "lucide-react";
import { toast } from "sonner";
import { markManyPaidInFull, duplicateOrder, deleteOrder, markManyDelivered, deleteManyOrders } from "@/app/actions";
import { downloadCSV } from "@/components/ui/table-kit";
import { Table, THead, TR, TD, TH, EmptyState } from "@/components/ui/table";
import { STATUS_BADGE } from "@/components/ui/badge";
import { ChannelIcon } from "@/components/ui/channel-icon";
import { SelectionBar, SelectionAction } from "@/components/ui/selection-bar";
import { useSort, SortableTH, RowMenu, useConfirm } from "@/components/ui/table-kit";
import { STATUS_TONE } from "@/lib/statuts";
import { occasionIcon, occasionShort } from "@/lib/occasions";
import { OCCASIONS } from "@/lib/order-options";
import { cn } from "@/lib/ui";

const STATUS_FILTER = [
  { id: "LEAD", label: "Lead" },
  { id: "DEVIS_ENVOYE", label: "Devis envoyé" },
  { id: "ACOMPTE_RECU", label: "Confirmé" },
  { id: "EN_PRODUCTION", label: "En production" },
  { id: "LIVRE", label: "Livré" },
  { id: "ANNULE", label: "Annulé" },
];
const fieldCls = "h-9 rounded-lg border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-(--color-brand)";

export type Row = {
  id: string;
  name: string;
  occasion: string;
  date: string;
  dateISO: string | null;
  status: string;
  sourceId: string; // canal d'acquisition (enum Source)
  amountCents: number; // priceQuoted en CHF
  paidCents: number; // acompte + solde encaissés
  search: string; // index de recherche (nom, contact, occasion, thème, notes, médias…)
};

const ACCESSORS = {
  date: (r: Row) => r.dateISO,
  name: (r: Row) => r.name.toLowerCase(),
  occasion: (r: Row) => (r.occasion === "—" ? null : r.occasion.toLowerCase()),
  status: (r: Row) => r.status,
  amount: (r: Row) => r.amountCents,
} as Record<string, (r: Row) => string | number | null>;

export default function OrdersTable({ rows, statut, annee, years }: { rows: Row[]; statut: string; annee: string; years: string[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [occ, setOcc] = useState("");
  const { sorted, sort, toggle } = useSort(rows, { key: "date", dir: "desc" }, ACCESSORS);
  const { confirm, node } = useConfirm();

  const currentYear = years[0] ?? annee;
  const go = (statutVal: string, anneeVal: string) => {
    const p = new URLSearchParams();
    if (statutVal) p.set("statut", statutVal);
    if (anneeVal && anneeVal !== currentYear) p.set("annee", anneeVal);
    router.push(`/commandes${p.toString() ? `?${p}` : ""}`);
  };

  // Recherche live (multi-mots, tous doivent matcher) + filtre occasion (client).
  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return sorted.filter((r) => (!occ || r.occasion === occ) && (tokens.length === 0 || tokens.every((t) => r.search.includes(t))));
  }, [sorted, occ, query]);
  const totalChf = filtered.reduce((a, r) => a + r.amountCents, 0);

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

      {/* Filtres — recherche live pleine largeur + déroulants */}
      <div className="mb-3 space-y-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher (nom, occasion, thème, téléphone, notes…)"
          className={cn(fieldCls, "w-full")}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select value={statut} onChange={(e) => go(e.target.value, annee)} className={fieldCls}>
            <option value="">Tous statuts</option>
            {STATUS_FILTER.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select value={occ} onChange={(e) => setOcc(e.target.value)} className={fieldCls}>
            <option value="">Toutes occasions</option>
            {OCCASIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={annee} onChange={(e) => go(statut, e.target.value)} className={fieldCls}>
            {years.map((yy) => <option key={yy} value={yy}>{yy}</option>)}
            <option value="all">Toutes années</option>
          </select>
          {(statut || occ || query || annee !== currentYear) && (
            <button
              type="button"
              onClick={() => { setQuery(""); setOcc(""); if (statut || annee !== currentYear) router.push("/commandes"); }}
              className="text-sm text-zinc-400 transition-colors hover:text-zinc-700"
            >
              Réinitialiser
            </button>
          )}
          <span className="ml-auto text-xs text-zinc-400">
            {filtered.length} commande{filtered.length > 1 ? "s" : ""} · CHF {totalChf.toLocaleString("fr-CH")}
          </span>
        </div>
      </div>

      <SelectionBar count={count} label={count > 1 ? "commandes" : "commande"} onClear={() => setSel({})}>
        <SelectionAction icon={<CheckCheck />} label="Tout sélectionner" onClick={() => setSel(Object.fromEntries(rows.map((r) => [r.id, true])))} />
        <SelectionAction
          icon={<Download />}
          label="Exporter en CSV"
          onClick={() => {
            const chosen = rows.filter((r) => sel[r.id]);
            downloadCSV(
              `commandes-selection-${new Date().toISOString().slice(0, 10)}.csv`,
              ["date_evenement", "cliente", "occasion", "statut", "montant_chf"],
              chosen.map((r) => [r.dateISO?.slice(0, 10) ?? "", r.name, r.occasion, STATUS_BADGE[r.status]?.label ?? r.status, r.amountCents])
            );
          }}
        />
        <SelectionAction
          icon={<PackageCheck />}
          label="Marquer livrées"
          onClick={() =>
            confirm({
              title: `Marquer ${count} commande${count > 1 ? "s" : ""} livrée${count > 1 ? "s" : ""}`,
              desc: "Horodate la livraison (les demandes d'avis suivront pour les fiches éligibles).",
              confirmLabel: "Marquer livrées",
              action: async () => { await markManyDelivered(chosenIds()); setSel({}); router.refresh(); },
            })
          }
        />
        <SelectionAction
          icon={<Banknote />}
          label="Marquer payées en entier"
          onClick={async () => {
            const ids = chosenIds();
            const fd = new FormData();
            ids.forEach((id) => fd.append("ids", id));
            await markManyPaidInFull(fd);
            setSel({});
            router.refresh();
            toast.success(`${ids.length} commande${ids.length > 1 ? "s" : ""} marquée${ids.length > 1 ? "s" : ""} payée${ids.length > 1 ? "s" : ""}.`);
          }}
        />
        <SelectionAction
          icon={<Trash2 />}
          label="Supprimer"
          destructive
          onClick={() =>
            confirm({
              title: `Supprimer ${count} commande${count > 1 ? "s" : ""}`,
              desc: "Fiches, historiques et relances disparaissent. Définitif.",
              confirmLabel: "Supprimer",
              action: async () => { await deleteManyOrders(chosenIds()); setSel({}); router.refresh(); },
            })
          }
        />
      </SelectionBar>

      <Table>
        <THead>
          <tr>
            <SortableTH label="Événement" k="date" sort={sort} onToggle={toggle} />
            <TH className="w-8" aria-label="Canal" />
            <SortableTH label="Cliente" k="name" sort={sort} onToggle={toggle} />
            <SortableTH label="Occasion" k="occasion" sort={sort} onToggle={toggle} />
            <SortableTH label="Statut" k="status" sort={sort} onToggle={toggle} />
            <SortableTH label="Montant" k="amount" sort={sort} onToggle={toggle} className="text-right" align="right" />
            <TH className="w-10" />
          </tr>
        </THead>
        <tbody>
          {filtered.map((r) => {
            const OccIcon = occasionIcon(r.occasion);
            const totalC = r.amountCents * 100;
            const pct = totalC > 0 ? Math.min(100, Math.round((r.paidCents / totalC) * 100)) : 0;
            const payTone = r.status === "ANNULE" || totalC === 0 ? "zinc" : r.paidCents >= totalC ? "emerald" : r.paidCents > 0 ? "amber" : "red";
            const payBar = { zinc: "bg-zinc-300", red: "bg-red-500", amber: "bg-amber-500", emerald: "bg-emerald-500" }[payTone];
            const paidChf = r.paidCents / 100;
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
                <TD className="w-8">
                  <ChannelIcon source={r.sourceId} className="size-4" />
                </TD>
                <TD>
                  <span className="font-medium text-zinc-900">{r.name}</span>
                </TD>
                <TD>
                  {r.occasion === "—" ? (
                    <span className="text-zinc-400">—</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-zinc-700">
                      <OccIcon className="size-3.5 shrink-0 text-(--color-brand)" />
                      <span className="truncate">{occasionShort(r.occasion)}</span>
                    </span>
                  )}
                </TD>
                <TD>
                  <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold", STATUS_TONE[r.status] ?? "bg-zinc-100 text-zinc-600")}>
                    {STATUS_BADGE[r.status]?.label ?? r.status}
                  </span>
                </TD>
                <TD className="text-right">
                  <div className="inline-block min-w-28 text-right">
                    <div className="whitespace-nowrap font-medium tabular-nums text-zinc-900">CHF {paidChf % 1 ? paidChf.toFixed(2) : paidChf} / {r.amountCents || "—"}</div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-100">
                      <div className={cn("h-full rounded-full", payBar)} style={{ width: `${Math.max(pct, r.paidCents > 0 ? 6 : 0)}%` }} />
                    </div>
                  </div>
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
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  icon={<Archive />}
                  title="Aucune commande ne correspond"
                  hint={query || occ ? "Aucun résultat pour cette recherche — essaie d'autres mots, une autre occasion ou « Toutes années »." : "Élargis la période ou réinitialise les filtres."}
                />
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
