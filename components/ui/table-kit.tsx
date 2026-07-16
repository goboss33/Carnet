"use client";

/* ---------------------------------------------------------------------------
   Kit de tables — tri client, menu d'actions par ligne, confirmation,
   export CSV. Utilisé par toutes les tables de l'app (R2).
--------------------------------------------------------------------------- */

import { useMemo, useState, useTransition } from "react";
import { ArrowUp, ArrowDown, ChevronsUpDown, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/* ------------------------------------------------------------------ tri */
export type SortDir = "asc" | "desc";

export function useSort<T>(rows: T[], initial: { key: string; dir: SortDir }, accessors: Record<string, (r: T) => string | number | null | undefined>) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    const acc = accessors[sort.key];
    if (!acc) return rows;
    return [...rows].sort((a, b) => {
      const va = acc(a) ?? null;
      const vb = acc(b) ?? null;
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // valeurs vides en bas, toujours
      if (vb === null) return -1;
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "fr");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, accessors]);
  const toggle = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  return { sorted, sort, toggle };
}

export function SortableTH({
  label, k, sort, onToggle, className, align,
}: { label: string; k: string; sort: { key: string; dir: SortDir }; onToggle: (k: string) => void; className?: string; align?: "right" }) {
  const active = sort.key === k;
  return (
    <th className={cn("px-4 py-2.5 font-medium", className)}>
      <button
        type="button"
        onClick={() => onToggle(k)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-zinc-800",
          active ? "text-zinc-800" : "text-zinc-500",
          align === "right" && "flex-row-reverse"
        )}
      >
        {label}
        {active ? (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ChevronsUpDown className="size-3 opacity-50" />}
      </button>
    </th>
  );
}

/* --------------------------------------------------------- menu de ligne */
export type RowAction = {
  label: string;
  icon?: React.ReactNode;
  href?: string;
  onSelect?: () => void;
  destructive?: boolean;
  separatorBefore?: boolean;
};

export function RowMenu({ actions, ariaLabel = "Actions" }: { actions: RowAction[]; ariaLabel?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label={ariaLabel} className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 data-[state=open]:bg-zinc-100 data-[state=open]:text-zinc-700">
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {actions.map((a, i) => (
          <span key={a.label}>
            {a.separatorBefore && i > 0 ? <DropdownMenuSeparator /> : null}
            {a.href ? (
              <DropdownMenuItem asChild destructive={a.destructive}>
                <a href={a.href}>{a.icon}{a.label}</a>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem destructive={a.destructive} onSelect={a.onSelect}>
                {a.icon}{a.label}
              </DropdownMenuItem>
            )}
          </span>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* -------------------------------------------------------- confirmation */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; desc?: string; confirmLabel: string; action: () => Promise<{ error?: string } | void> } | null>(null);
  const [pending, start] = useTransition();

  const confirm = (opts: NonNullable<typeof state>) => setState(opts);

  const node = (
    <Dialog open={!!state} onOpenChange={(o) => !o && setState(null)}>
      {state ? (
        <DialogContent title={state.title} desc={state.desc}>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setState(null)} disabled={pending}>Annuler</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await state.action();
                  if (r && "error" in r && r.error) toast.error(r.error);
                  else toast.success(`${state.title} — fait.`);
                  setState(null);
                })
              }
            >
              {pending ? "…" : state.confirmLabel}
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
  return { confirm, node };
}

/* --------------------------------------------------------------- CSV */
export function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const bom = "﻿"; // Excel fr
  const csv = bom + [headers, ...rows].map((r) => r.map(esc).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Export « ${filename} » téléchargé.`);
}
