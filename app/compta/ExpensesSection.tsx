"use client";

/* Dépenses du mois — mêmes interactions que les tables de l'app.
   Table triable (Date / Commerçant / Catégorie / Montant) : clic → modale
   d'édition ; appui long (~0,5 s) → sélection multiple (pilule flottante :
   export CSV / suppression) ; Ctrl/Cmd+clic direct. Graphique en BARRES
   VERTICALES par catégorie (cliquables = filtre) ; recherche live.
   « + Dépense » ouvre la même modale, vide. */

import { useMemo, useRef, useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Plus, X, Check, Download, Trash2, CheckCheck, FileText, Camera, Receipt } from "lucide-react";
import { toast } from "sonner";
import { updateExpense, createExpense, deleteExpense, deleteManyExpenses } from "@/app/actions";
import { CATEGORIES, CAT_TONE, CAT_BAR, catLabel, chf } from "@/lib/money";
import { SelectionBar, SelectionAction } from "@/components/ui/selection-bar";
import { downloadCSV, useConfirm, useSort, SortableTH } from "@/components/ui/table-kit";
import { Table, THead, TR, TD, TH, EmptyState } from "@/components/ui/table";
import MediaViewer from "@/app/components/MediaViewer";
import { cn } from "@/lib/ui";

export type ExpenseRow = {
  id: string;
  dateISO: string; // YYYY-MM-DD
  dateLabel: string;
  merchant: string;
  category: string;
  totalCents: number;
  notes: string;
  receiptPath: string;
};

const fieldCls = "h-9 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-(--color-brand)";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

const ACCESSORS = {
  date: (r: ExpenseRow) => r.dateISO,
  merchant: (r: ExpenseRow) => r.merchant.toLowerCase(),
  category: (r: ExpenseRow) => catLabel(r.category),
  amount: (r: ExpenseRow) => r.totalCents,
} as Record<string, (r: ExpenseRow) => string | number | null>;

function ExpenseModal({ row, onClose }: { row: Partial<ExpenseRow>; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isNew = !row.id;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      if (isNew) await createExpense(fd);
      else await updateExpense(row.id!, fd);
      router.refresh();
      onClose();
    });
  };
  const remove = () => {
    if (!row.id || !window.confirm("Supprimer cette dépense ? Définitif.")) return;
    start(async () => {
      await deleteExpense(row.id!);
      router.refresh();
      onClose();
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-[1px]" onClick={onClose} />
      <form onSubmit={submit} className="relative z-10 max-h-[90vh] w-full max-w-sm space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[15px] font-bold text-zinc-900">{isNew ? "Nouvelle dépense" : "Dépense"}</p>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="size-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label><span className={labelCls}>Date</span><input name="date" type="date" defaultValue={row.dateISO ?? new Date().toISOString().slice(0, 10)} className={fieldCls} /></label>
          <label><span className={labelCls}>Montant (CHF) *</span><input name="totalChf" type="number" step="0.05" min="0" required defaultValue={row.totalCents ? row.totalCents / 100 : ""} autoFocus={isNew} className={fieldCls} /></label>
          <label className="col-span-2"><span className={labelCls}>Commerçant</span><input name="merchant" placeholder="Migros, Landi…" defaultValue={row.merchant ?? ""} className={fieldCls} /></label>
          <label className="col-span-2">
            <span className={labelCls}>Catégorie</span>
            <select name="category" defaultValue={row.category ?? "MATIERES_PREMIERES"} className={fieldCls}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
          </label>
          <label className="col-span-2"><span className={labelCls}>Note</span><input name="notes" placeholder="Optionnel" defaultValue={row.notes ?? ""} className={fieldCls} /></label>
        </div>

        {row.receiptPath ? (
          <MediaViewer src={`/api/receipts/${row.receiptPath}`} kind={row.receiptPath.endsWith(".pdf") ? "pdf" : "image"} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-(--color-brand) hover:underline" title="Voir le justificatif">
            {row.receiptPath.endsWith(".pdf") ? <FileText className="size-4" /> : <Camera className="size-4" />} Voir le justificatif
          </MediaViewer>
        ) : null}

        <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
          {!isNew ? (
            <button type="button" onClick={remove} className="text-[13px] text-zinc-400 transition-colors hover:text-red-600">Supprimer</button>
          ) : <span />}
          <button disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50">
            <Check className="size-4" /> {isNew ? "Ajouter" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}

export default function ExpensesSection({ rows }: { rows: ExpenseRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Partial<ExpenseRow> | null>(null);
  const { confirm, node } = useConfirm();

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const r of rows) t[r.category] = (t[r.category] ?? 0) + r.totalCents;
    return t;
  }, [rows]);
  const maxCat = Math.max(1, ...Object.values(totals));
  const cats = CATEGORIES.filter((c) => totals[c.id]);

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (cat && r.category !== cat) return false;
      if (!tokens.length) return true;
      const blob = `${r.merchant} ${catLabel(r.category)} ${r.notes} ${r.totalCents / 100} ${r.dateLabel}`.toLowerCase();
      return tokens.every((t) => blob.includes(t));
    });
  }, [rows, query, cat]);

  const { sorted, sort, toggle } = useSort(filtered, { key: "date", dir: "desc" }, ACCESSORS);

  const count = useMemo(() => rows.reduce((n, r) => n + (sel[r.id] ? 1 : 0), 0), [rows, sel]);
  const selMode = count > 0;
  const selected = rows.filter((r) => sel[r.id]);

  // ------- appui long + désambiguïsation du scroll --------
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const suppressRef = useRef(false);
  const clearPress = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } startRef.current = null; };
  useEffect(() => () => clearPress(), []);
  const onPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    suppressRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { timerRef.current = null; suppressRef.current = true; setSel((s) => ({ ...s, [id]: true })); }, 500);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current || !timerRef.current) return;
    if (Math.abs(e.clientX - startRef.current.x) > 10 || Math.abs(e.clientY - startRef.current.y) > 10) clearPress();
  };
  const onRowClick = (e: React.MouseEvent, r: ExpenseRow) => {
    if (suppressRef.current) { suppressRef.current = false; return; }
    if (selMode || e.ctrlKey || e.metaKey) { setSel((s) => ({ ...s, [r.id]: !s[r.id] })); return; }
    setEditing(r);
  };

  const totalShown = filtered.reduce((a, r) => a + r.totalCents, 0);

  return (
    <div>
      {node}
      {editing && <ExpenseModal row={editing} onClose={() => setEditing(null)} />}

      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="text-sm font-bold text-zinc-700">Dépenses du mois</p>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-zinc-400">{filtered.length} · {chf(totalShown)}</span>
          <button type="button" onClick={() => setEditing({})} className="inline-flex h-8 items-center gap-1 rounded-lg bg-zinc-900 px-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-zinc-700">
            <Plus className="size-4" /> Dépense
          </button>
        </div>
      </div>

      {/* Répartition par catégorie — barres verticales cliquables (= filtre) */}
      {cats.length > 0 && (
        <div className="mb-3 rounded-2xl border border-zinc-200 bg-white px-3 pb-2 pt-3">
          <div className="flex items-end justify-around gap-2">
            {cats.map((c) => {
              const on = cat === c.id;
              const pct = Math.max(8, Math.round((totals[c.id] / maxCat) * 100));
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCat(on ? "" : c.id)}
                  aria-pressed={on}
                  title={`${c.label} — ${chf(totals[c.id])}`}
                  className="group flex min-w-0 flex-1 flex-col items-center gap-1"
                >
                  <span className="whitespace-nowrap text-[10px] font-semibold tabular-nums text-zinc-500">{chf(totals[c.id])}</span>
                  <span className="flex h-20 w-full max-w-9 items-end">
                    <span
                      className={cn("block w-full rounded-t-md transition-all", CAT_BAR[c.id], on ? "opacity-100 ring-2 ring-(--color-brand) ring-offset-1" : cat ? "opacity-35 group-hover:opacity-70" : "opacity-90 group-hover:opacity-100")}
                      style={{ height: `${pct}%` }}
                    />
                  </span>
                  <span className={cn("w-full truncate text-center text-[10px] leading-tight", on ? "font-semibold text-(--color-brand)" : "text-zinc-500")}>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {rows.length > 3 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher (commerçant, catégorie, note, montant…)"
          className={cn(fieldCls, "mb-2")}
        />
      )}

      <Table>
        <THead>
          <tr>
            <SortableTH label="Date" k="date" sort={sort} onToggle={toggle} />
            <SortableTH label="Commerçant" k="merchant" sort={sort} onToggle={toggle} />
            <SortableTH label="Catégorie" k="category" sort={sort} onToggle={toggle} />
            <TH className="w-8" aria-label="Justificatif" />
            <SortableTH label="Montant" k="amount" sort={sort} onToggle={toggle} className="text-right" align="right" />
          </tr>
        </THead>
        <tbody>
          {sorted.map((r) => (
            <TR
              key={r.id}
              className={cn("cursor-pointer select-none", sel[r.id] ? "bg-(--color-brand-soft) even:bg-(--color-brand-soft) hover:bg-(--color-brand-soft)" : "even:bg-zinc-50/50")}
              onClick={(e) => onRowClick(e, r)}
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
                  {r.dateLabel}
                </span>
              </TD>
              <TD className="max-w-[180px]">
                <span className="block truncate font-medium text-zinc-900">{r.merchant || <span className="font-normal text-zinc-400">Commerçant ?</span>}</span>
              </TD>
              <TD>
                <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", CAT_TONE[r.category] ?? CAT_TONE.AUTRE)}>{catLabel(r.category)}</span>
              </TD>
              <TD className="w-8" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                {r.receiptPath ? (
                  <MediaViewer src={`/api/receipts/${r.receiptPath}`} kind={r.receiptPath.endsWith(".pdf") ? "pdf" : "image"} className="text-zinc-400 hover:text-zinc-700" title="Voir le justificatif">
                    {r.receiptPath.endsWith(".pdf") ? <FileText className="size-4" /> : <Camera className="size-4" />}
                  </MediaViewer>
                ) : null}
              </TD>
              <TD className="whitespace-nowrap text-right font-semibold tabular-nums text-zinc-900">{chf(r.totalCents)}</TD>
            </TR>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={5}>
                <EmptyState
                  icon={<Receipt />}
                  title={rows.length === 0 ? "Aucune dépense ce mois-ci" : "Aucune dépense ne correspond"}
                  hint={rows.length === 0 ? "Envoie une photo de ticket au bot, ou ajoute-la ici." : "Essaie un autre terme ou retire le filtre."}
                />
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <SelectionBar count={count} label={count > 1 ? "dépenses" : "dépense"} onClear={() => setSel({})}>
        <SelectionAction icon={<CheckCheck />} label="Tout sélectionner" onClick={() => setSel(Object.fromEntries(sorted.map((r) => [r.id, true])))} />
        <SelectionAction
          icon={<Download />}
          label="Exporter en CSV"
          onClick={() =>
            downloadCSV(
              `depenses-${new Date().toISOString().slice(0, 10)}.csv`,
              ["date", "commercant", "categorie", "montant_chf", "note"],
              selected.map((r) => [r.dateISO, r.merchant, catLabel(r.category), (r.totalCents / 100).toFixed(2), r.notes])
            )
          }
        />
        <SelectionAction
          icon={<Trash2 />}
          label="Supprimer"
          destructive
          onClick={() =>
            confirm({
              title: `Supprimer ${count} dépense${count > 1 ? "s" : ""}`,
              desc: "Les justificatifs liés restent sur le disque. Définitif.",
              confirmLabel: "Supprimer",
              action: async () => {
                await deleteManyExpenses(selected.map((r) => r.id));
                setSel({});
                router.refresh();
                toast.success("Dépenses supprimées.");
              },
            })
          }
        />
      </SelectionBar>
    </div>
  );
}
