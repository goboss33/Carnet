"use client";

/* Dépenses du mois — mêmes interactions que les tables de l'app.
   Lignes d'AFFICHAGE pur (date, commerçant, pastille catégorie, justificatif,
   montant) : clic → modale d'édition ; appui long (~0,5 s) → sélection multiple
   (pilule flottante : export CSV / suppression) ; Ctrl/Cmd+clic direct.
   Chips de catégories (montant + mini-barre) = filtres ; recherche live.
   « + Dépense » ouvre la même modale, vide. */

import { useMemo, useRef, useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Plus, X, Check, Download, Trash2, CheckCheck, FileText, Camera } from "lucide-react";
import { toast } from "sonner";
import { updateExpense, createExpense, deleteExpense, deleteManyExpenses } from "@/app/actions";
import { CATEGORIES, CAT_TONE, CAT_BAR, catLabel, chf } from "@/lib/money";
import { SelectionBar, SelectionAction } from "@/components/ui/selection-bar";
import { downloadCSV, useConfirm } from "@/components/ui/table-kit";
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

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (cat && r.category !== cat) return false;
      if (!tokens.length) return true;
      const blob = `${r.merchant} ${catLabel(r.category)} ${r.notes} ${r.totalCents / 100} ${r.dateLabel}`.toLowerCase();
      return tokens.every((t) => blob.includes(t));
    });
  }, [rows, query, cat]);

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

      {/* Chips catégories = filtres (montant + mini-barre proportionnelle) */}
      {Object.keys(totals).length > 0 && (
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CATEGORIES.filter((c) => totals[c.id]).map((c) => {
            const on = cat === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(on ? "" : c.id)}
                aria-pressed={on}
                className={cn(
                  "shrink-0 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                  on ? "border-(--color-brand) bg-(--color-brand-soft)" : "border-zinc-200 bg-white hover:border-zinc-300",
                )}
              >
                <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-semibold", CAT_TONE[c.id])}>{c.label}</span>
                <span className="ml-1.5 text-[12px] font-semibold tabular-nums text-zinc-700">{chf(totals[c.id])}</span>
                <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                  <span className={cn("block h-full rounded-full", CAT_BAR[c.id])} style={{ width: `${Math.round((totals[c.id] / maxCat) * 100)}%` }} />
                </span>
              </button>
            );
          })}
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

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {filtered.map((r) => (
          <div
            key={r.id}
            role="button"
            tabIndex={0}
            onClick={(e) => onRowClick(e, r)}
            onKeyDown={(e) => { if (e.key === "Enter") setEditing(r); }}
            onPointerDown={(e) => onPointerDown(e, r.id)}
            onPointerMove={onPointerMove}
            onPointerUp={clearPress}
            onPointerLeave={clearPress}
            onPointerCancel={clearPress}
            className={cn(
              "flex cursor-pointer select-none items-center gap-2.5 border-b border-zinc-100 px-3.5 py-2.5 text-sm transition-colors last:border-b-0",
              sel[r.id] ? "bg-(--color-brand-soft)" : "even:bg-zinc-50/50 hover:bg-zinc-50",
            )}
          >
            {selMode ? (
              <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors", sel[r.id] ? "border-(--color-brand) bg-(--color-brand) text-white" : "border-zinc-300 bg-white")}>
                {sel[r.id] && <Check className="size-3" />}
              </span>
            ) : (
              <span className="w-10 shrink-0 whitespace-nowrap text-[12px] tabular-nums text-zinc-400">{r.dateLabel}</span>
            )}
            <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">{r.merchant || <span className="font-normal text-zinc-400">Commerçant ?</span>}</span>
            <span className={cn("hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline-block", CAT_TONE[r.category] ?? CAT_TONE.AUTRE)}>{catLabel(r.category)}</span>
            {r.receiptPath ? (
              <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                <MediaViewer src={`/api/receipts/${r.receiptPath}`} kind={r.receiptPath.endsWith(".pdf") ? "pdf" : "image"} className="text-zinc-400 hover:text-zinc-700" title="Voir le justificatif">
                  {r.receiptPath.endsWith(".pdf") ? <FileText className="size-4" /> : <Camera className="size-4" />}
                </MediaViewer>
              </span>
            ) : null}
            <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-zinc-900">{chf(r.totalCents)}</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-zinc-400">
            {rows.length === 0 ? "Aucune dépense ce mois-ci — envoie une photo de ticket au bot, ou ajoute-la ici." : "Aucune dépense ne correspond."}
          </p>
        )}
      </div>

      <SelectionBar count={count} label={count > 1 ? "dépenses" : "dépense"} onClear={() => setSel({})}>
        <SelectionAction icon={<CheckCheck />} label="Tout sélectionner" onClick={() => setSel(Object.fromEntries(filtered.map((r) => [r.id, true])))} />
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
