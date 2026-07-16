"use client";

/* ---------------------------------------------------------------------------
   Pipeline kanban — drag & drop (souris, et long-press sur mobile),
   menu ⋯ par carte, indicateurs (données manquantes, reste à encaisser).
   Le déplacement appelle moveOrderStatus (mêmes effets que le passage
   d'étape : deliveredAt, acompte, annulation).
--------------------------------------------------------------------------- */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, DragOverlay, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { ExternalLink, ArrowRight, PackageCheck, XCircle, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { moveOrderStatus, advanceStatus } from "@/app/actions";
import { avatar, fmtRel, cn } from "@/lib/ui";
import { RowMenu } from "@/components/ui/table-kit";
import { Badge } from "@/components/ui/badge";

export type CardData = {
  id: string;
  status: string;
  name: string;
  occasion: string;
  eventDateISO: string | null;
  price: number | null;
  sourceLabel: string;
  missing: number; // dette de fiche
  dueCents: number; // reste à encaisser (LIVRE)
};

export type ColumnData = { id: string; label: string; hint: string; dot: string; total: number; count: number; hiddenCount: number };

const TONE: Record<string, string> = {
  urgent: "bg-red-50 text-red-700",
  soon: "bg-amber-50 text-amber-700",
  normal: "bg-zinc-100 text-zinc-500",
  past: "bg-zinc-100 text-zinc-400",
};

function Card({ card, dragging, handleProps }: { card: CardData; dragging?: boolean; handleProps?: React.HTMLAttributes<HTMLSpanElement> }) {
  const router = useRouter();
  const av = avatar(card.name);
  const rel = fmtRel(card.eventDateISO ? new Date(card.eventDateISO) : null);
  return (
    <div className={cn("rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-shadow", dragging && "rotate-1 shadow-lg ring-2 ring-(--color-brand)/30")}>
      <div className="flex items-start gap-0.5 px-1 pt-1">
        <span
          {...handleProps}
          className="-m-0.5 flex min-h-10 min-w-7 cursor-grab touch-none items-center justify-center self-stretch rounded-md text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-500 active:cursor-grabbing"
          aria-label="Déplacer la carte"
          role="button"
        >
          <GripVertical className="size-3.5" />
        </span>
        <Link href={`/commandes/${card.id}`} className="block min-w-0 flex-1 px-0.5 pb-1 pt-0.5">
          <div className="flex items-center gap-2.5">
            <span className={`relative flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${av.color}`}>
              {av.initials}
              {card.missing > 0 && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-white" title={`${card.missing} donnée(s) manquante(s)`} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold leading-tight text-zinc-900">{card.name}</p>
              <p className="truncate text-xs text-zinc-400">{card.occasion || "occasion à préciser"}</p>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1">
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TONE[rel.tone]}`}>{rel.text}</span>
            <span className="flex items-center gap-1.5">
              {card.dueCents > 0 && <Badge variant="warning">reste CHF {(card.dueCents / 100).toLocaleString("fr-CH")}</Badge>}
              <span className="text-[13px] font-semibold tabular-nums text-zinc-700">{card.price ? `CHF ${card.price}` : "—"}</span>
            </span>
          </div>
        </Link>
        <span onClick={(e) => e.stopPropagation()}>
          <RowMenu
            ariaLabel={`Actions ${card.name}`}
            actions={[
              { label: "Ouvrir la fiche", icon: <ExternalLink />, href: `/commandes/${card.id}` },
              ...(card.status !== "LIVRE"
                ? [{
                    label: "Étape suivante",
                    icon: <ArrowRight />,
                    onSelect: async () => {
                      await advanceStatus(card.id);
                      toast.success(`${card.name} — étape suivante.`);
                      router.refresh();
                    },
                  },
                  {
                    label: "Marquer livré",
                    icon: <PackageCheck />,
                    onSelect: async () => {
                      const r = await moveOrderStatus(card.id, "LIVRE" as never);
                      if (r.error) toast.error(r.error);
                      else toast.success(`${card.name} — livré.`);
                      router.refresh();
                    },
                  }]
                : []),
              {
                label: "Annuler la commande",
                icon: <XCircle />,
                destructive: true,
                separatorBefore: true,
                onSelect: async () => {
                  const r = await moveOrderStatus(card.id, "ANNULE" as never);
                  if (r.error) toast.error(r.error);
                  else toast.success(`${card.name} — annulée.`);
                  router.refresh();
                },
              },
            ]}
          />
        </span>
      </div>
    </div>
  );
}

function DraggableCard({ card }: { card: CardData }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <li ref={setNodeRef} className={cn(isDragging && "opacity-30")}>
      <Card card={card} handleProps={{ ...listeners, ...attributes } as React.HTMLAttributes<HTMLSpanElement>} />
    </li>
  );
}

function Column({ col, cards }: { col: ColumnData; cards: CardData[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <section ref={setNodeRef} className={cn("flex flex-col rounded-2xl bg-zinc-100/70 p-2 transition-colors", isOver && "bg-(--color-brand-soft) ring-2 ring-(--color-brand)/25")}>
      <header className="flex items-baseline gap-2 px-2 py-2">
        <span className={`h-2 w-2 shrink-0 self-center rounded-full ${col.dot}`} />
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-zinc-600">{col.label}</h2>
        <span className="ml-auto text-xs font-semibold tabular-nums text-zinc-400">{col.count}</span>
        {col.total > 0 && <span className="text-xs font-semibold tabular-nums text-zinc-500">· CHF {col.total.toLocaleString("fr-CH")}</span>}
      </header>
      <ul className="min-h-16 space-y-2">
        {cards.length === 0 && (
          <li className="rounded-xl border border-dashed border-zinc-200 px-3 py-5 text-center text-xs text-zinc-400">{col.hint}</li>
        )}
        {cards.map((c) => (
          <DraggableCard key={c.id} card={c} />
        ))}
        {col.hiddenCount > 0 && (
          <li className="px-2 py-1.5 text-center text-[11px] text-zinc-400">
            + {col.hiddenCount} plus anciennes — voir l'<Link href="/commandes" className="underline">historique</Link>
          </li>
        )}
      </ul>
    </section>
  );
}

export default function PipelineBoard({ columns, cards }: { columns: ColumnData[]; cards: CardData[] }) {
  const router = useRouter();
  const [local, setLocal] = useState(cards);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 12 } })
  );

  // resync quand le serveur renvoie de nouvelles données
  useMemo(() => setLocal(cards), [cards]);

  const active = activeId ? local.find((c) => c.id === activeId) : null;

  const onStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const overCol = e.over?.id ? String(e.over.id) : null;
    const card = local.find((c) => c.id === String(e.active.id));
    if (!overCol || !card || card.status === overCol) return;
    const prev = local;
    setLocal((cs) => cs.map((c) => (c.id === card.id ? { ...c, status: overCol } : c))); // optimiste
    const r = await moveOrderStatus(card.id, overCol as never);
    if (r.error) {
      setLocal(prev);
      toast.error(r.error);
    } else {
      const label = columns.find((c) => c.id === overCol)?.label ?? overCol;
      toast.success(`${card.name} → ${label}`);
      router.refresh();
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {columns.map((col) => (
          <Column key={col.id} col={col} cards={local.filter((c) => c.status === col.id)} />
        ))}
      </div>
      <DragOverlay>{active ? <Card card={active} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
