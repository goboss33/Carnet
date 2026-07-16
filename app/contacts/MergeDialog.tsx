"use client";

/* Fusion de deux fiches — choix champ par champ, commandes réattachées. */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { mergeContacts } from "@/app/actions";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui";
import type { Row } from "./ContactsTable";

const FIELDS = [
  { key: "name", label: "Nom" },
  { key: "phone", label: "Téléphone" },
  { key: "email", label: "E-mail" },
  { key: "instagram", label: "Instagram" },
] as const;

export default function MergeDialog({ a, b, onClose }: { a: Row; b: Row; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // keep = fiche conservée (celle avec le plus de commandes par défaut)
  const [keepIsA, setKeepIsA] = useState(a.ordersCount >= b.ordersCount);
  const [choice, setChoice] = useState<Record<string, "a" | "b">>({
    name: a.ordersCount >= b.ordersCount ? "a" : "b",
    phone: a.phone ? "a" : "b",
    email: a.email ? "a" : "b",
    instagram: a.instagram ? "a" : "b",
  });
  const val = (r: Row, k: string) => (k === "name" ? r.name : ((r as unknown as Record<string, string>)[k] ?? ""));

  const submit = () =>
    start(async () => {
      const keep = keepIsA ? a : b;
      const drop = keepIsA ? b : a;
      const pick = (k: string) => (choice[k] === "a" ? val(a, k) : val(b, k));
      const [firstName, ...rest] = pick("name").split(/\s+/);
      const r = await mergeContacts(keep.id, drop.id, {
        firstName: firstName ?? "",
        lastName: rest.join(" "),
        phone: pick("phone"),
        email: pick("email"),
        instagram: pick("instagram"),
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success(`Fiches fusionnées — ${a.ordersCount + b.ordersCount} commandes réunies.`);
        onClose();
        router.refresh();
      }
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Fusionner les deux fiches"
        desc="Les commandes des deux fiches seront réunies. Choisis la valeur à garder pour chaque champ."
        className="max-w-lg"
      >
        <div className="mb-4 flex items-center gap-2 text-[13px]">
          <span className="text-zinc-500">Fiche conservée :</span>
          <button type="button" onClick={() => setKeepIsA(true)} className={cn("rounded-md px-2 py-1 font-medium", keepIsA ? "bg-(--color-brand-soft) text-(--color-brand)" : "text-zinc-500 hover:bg-zinc-100")}>{a.name}</button>
          <button type="button" onClick={() => setKeepIsA(false)} className={cn("rounded-md px-2 py-1 font-medium", !keepIsA ? "bg-(--color-brand-soft) text-(--color-brand)" : "text-zinc-500 hover:bg-zinc-100")}>{b.name}</button>
        </div>
        <div className="space-y-2.5">
          {FIELDS.map((f) => {
            const va = val(a, f.key);
            const vb = val(b, f.key);
            return (
              <div key={f.key}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{f.label}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["a", "b"] as const).map((side) => {
                    const v = side === "a" ? va : vb;
                    const active = choice[f.key] === side;
                    return (
                      <button
                        key={side}
                        type="button"
                        disabled={!v}
                        onClick={() => setChoice((c) => ({ ...c, [f.key]: side }))}
                        className={cn(
                          "truncate rounded-lg border px-3 py-2 text-left text-[13px] transition-colors",
                          active ? "border-(--color-brand) bg-(--color-brand-soft) font-medium text-zinc-900" : "border-zinc-200 text-zinc-600 hover:border-zinc-300",
                          !v && "opacity-40"
                        )}
                      >
                        {v || "—"}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-zinc-400">Les notes des deux fiches sont conservées (concaténées).</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>Annuler</Button>
          <Button variant="brand" size="sm" onClick={submit} disabled={pending}>{pending ? "Fusion…" : "Fusionner"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
