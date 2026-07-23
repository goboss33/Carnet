import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { STATUS_TONE } from "@/lib/statuts";
import { paymentState } from "@/lib/payments";
import { missingFor } from "@/lib/completeness";
import { occasionIcon, occasionShort } from "@/lib/occasions";
import { cn } from "@/lib/ui";
import { PageHeader } from "@/components/ui/page-header";
import { Truck, Store, Clock, MilkOff, MapPin } from "lucide-react";
import { MapsLink, shortAddress } from "@/components/ui/map-link";
import Heatmap, { type HeatDay } from "./Heatmap";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  ACOMPTE_RECU: "Confirmé",
  EN_PRODUCTION: "En production",
  DEVIS_ENVOYE: "Devis envoyé",
};

type OrderWithContact = Prisma.OrderGetPayload<{ include: { contact: true } }>;

/* Lundi 00:00 de la semaine de d. */
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
}

const localISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function Card({ o, now, anchorId }: { o: OrderWithContact; now: Date; anchorId?: string }) {
  const d = o.eventDate!;
  const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  const jx = days <= 0 ? "aujourd'hui" : days === 1 ? "demain" : `J-${days}`;
  const jxTone = days <= 1 ? "bg-red-50 text-red-600" : days <= 7 ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-zinc-500";
  const sameYear = d.getFullYear() === now.getFullYear();
  const OccIcon = occasionIcon(o.occasion);
  const pay = paymentState(o);
  const missing = missingFor(o).length;
  const isDevis = o.status === "DEVIS_ENVOYE";
  const heure = o.handoverAt ? o.handoverAt.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <li
      id={anchorId}
      className={cn(
        "relative flex scroll-mt-24 items-center gap-4 rounded-xl border border-zinc-200 bg-white px-4 py-3.5 transition-shadow hover:shadow-sm",
        isDevis && "opacity-55 hover:opacity-90"
      )}
    >
      {/* Toute la carte ouvre la fiche (calque) ; le lien d'itinéraire passe au-dessus. */}
      <Link href={`/commandes/${o.id}`} aria-label={`Ouvrir la commande de ${o.contact.firstName}`} className="absolute inset-0 z-[1] rounded-xl" />
        {/* Date : jour de semaine + date (année seulement si différente) + J-x */}
        <div className="w-16 shrink-0 text-center">
          <p className="text-[11px] font-semibold uppercase leading-none text-zinc-400">
            {d.toLocaleDateString("fr-CH", { weekday: "short" })}
          </p>
          <p className="mt-0.5 whitespace-nowrap text-[15px] font-bold leading-tight text-zinc-900">
            {d.toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}
          </p>
          {!sameYear && <p className="text-[11px] font-semibold text-zinc-400">{d.getFullYear()}</p>}
          <span className={cn("mt-1 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium", jxTone)}>{jx}</span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-zinc-900">{o.contact.firstName} {o.contact.lastName}</span>
            {missing > 0 && <span className="size-2 shrink-0 rounded-full bg-amber-500" title={`${missing} donnée(s) manquante(s)`} />}
          </p>
          {/* L2 — occasion (+ sans lactose) */}
          <p className="mt-1 flex items-center gap-2 text-[13px]">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-zinc-700">
              <OccIcon className="size-3.5 shrink-0 text-(--color-brand)" />
              <span className="truncate">{o.occasion ? occasionShort(o.occasion) : "à préciser"}</span>
            </span>
            {o.sansLactose && (
              <span className="shrink-0" title="Sans lactose"><MilkOff className="size-3.5 text-red-500" /></span>
            )}
          </p>
          {/* L3 — étages + parts */}
          <p className="mt-1 text-[13px] text-zinc-500">
            {[o.tiers ? `${o.tiers} étage${o.tiers > 1 ? "s" : ""}` : null, o.parts ? `${o.parts} parts` : null].filter(Boolean).join(" · ") || "—"}
          </p>
          {/* L4 — heure de remise + adresse (itinéraire) ou retrait atelier */}
          <p className="mt-1 flex min-w-0 items-center gap-4 text-[12px]">
            {heure ? (
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-zinc-700">
                <Clock className="size-3.5 text-zinc-400" /> {heure}
              </span>
            ) : !isDevis ? (
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-amber-600" title="Heure de remise à fixer">
                <Clock className="size-3.5" /> --:--
              </span>
            ) : null}
            {o.deliveryMode === "livraison" ? (
              o.deliveryAddress ? (
                <MapsLink address={o.deliveryAddress} className="relative z-[2] min-w-0 gap-1.5">
                  <MapPin className="size-3.5 shrink-0" />
                  <span className="truncate">{shortAddress(o.deliveryAddress)}</span>
                </MapsLink>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-medium text-amber-600"><Truck className="size-3.5 shrink-0" /> Livraison — adresse ?</span>
              )
            ) : (
              <span className="inline-flex items-center gap-1.5 text-zinc-400"><Store className="size-3.5 shrink-0" /> Retrait atelier</span>
            )}
          </p>
        </div>

        {/* Statut + argent */}
        <div className="shrink-0 text-right">
          <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold", STATUS_TONE[o.status] ?? "bg-zinc-100 text-zinc-600")}>
            {STATUS_LABEL[o.status] ?? o.status}
          </span>
          {pay.hasTotal && (
            <p className="mt-1.5 text-[11px] font-medium">
              {isDevis ? (
                <span className="text-zinc-400">CHF {o.priceQuoted}</span>
              ) : pay.isPaid ? (
                <span className="text-emerald-600">soldé ✓</span>
              ) : (
                <span className={pay.paidCents > 0 ? "text-amber-600" : "text-zinc-500"}>reste CHF {pay.dueCents / 100}</span>
              )}
            </p>
          )}
        </div>
    </li>
  );
}

export default async function Agenda() {
  const tenant = await currentTenant();
  const now = new Date();
  const orders = await prisma.order.findMany({
    where: {
      tenantId: tenant.id,
      status: { in: ["ACOMPTE_RECU", "EN_PRODUCTION", "DEVIS_ENVOYE"] },
      eventDate: { gte: new Date(Date.now() - 24 * 3600 * 1000) },
    },
    include: { contact: true },
    orderBy: { eventDate: "asc" },
  });

  // Heatmap : charge par jour (commandes confirmées/en production uniquement).
  const heatDays: Record<string, HeatDay> = {};
  for (const o of orders) {
    if (o.status === "DEVIS_ENVOYE") continue;
    const key = localISO(o.eventDate!);
    const h = (heatDays[key] ??= { count: 0, parts: 0 });
    h.count++;
    h.parts += o.parts ?? 0;
  }
  // Ancre du 1er gâteau de chaque jour (cible du clic sur la heatmap).
  const seenDays = new Set<string>();
  const anchorFor = (o: OrderWithContact): string | undefined => {
    const key = localISO(o.eventDate!);
    if (seenDays.has(key)) return undefined;
    seenDays.add(key);
    return `day-${key}`;
  };

  // Groupes : cette semaine, semaine prochaine (toujours affichés), puis par mois.
  const w1 = new Date(startOfWeek(now).getTime() + 7 * 86400000);
  const w2 = new Date(w1.getTime() + 7 * 86400000);
  const groups: { key: string; label: string; items: OrderWithContact[]; always?: boolean }[] = [
    { key: "this", label: "Cette semaine", items: [], always: true },
    { key: "next", label: "Semaine prochaine", items: [], always: true },
  ];
  for (const o of orders) {
    const d = o.eventDate!;
    if (d < w1) groups[0].items.push(o);
    else if (d < w2) groups[1].items.push(o);
    else {
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let g = groups.find((x) => x.key === key);
      if (!g) {
        const label = d.toLocaleDateString("fr-CH", { month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
        g = { key, label: label.charAt(0).toUpperCase() + label.slice(1), items: [] };
        groups.push(g);
      }
      g.items.push(o);
    }
  }

  return (
    <>
      <PageHeader
        title="Agenda de production"
        subtitle="Les événements à venir, par date — ce qui doit sortir de l'atelier."
      />
      <Heatmap days={heatDays} todayISO={localISO(now)} />
      <div className="space-y-7">
        {groups.filter((g) => g.always || g.items.length > 0).map((g) => {
          // Charge : seuls les gâteaux à produire comptent (les devis non confirmés sont exclus).
          const firm = g.items.filter((o) => o.status !== "DEVIS_ENVOYE");
          const parts = firm.reduce((a, o) => a + (o.parts ?? 0), 0);
          return (
            <section key={g.key}>
              <div className="mb-2.5 flex items-baseline gap-2 px-1">
                <h2 className="text-[13px] font-bold uppercase tracking-wide text-zinc-600">{g.label}</h2>
                {firm.length > 0 && (
                  <span className="text-[12px] tabular-nums text-zinc-400">
                    {firm.length} gâteau{firm.length > 1 ? "x" : ""}{parts > 0 ? ` · ${parts} parts` : ""}
                  </span>
                )}
              </div>
              {g.items.length > 0 ? (
                <ul className="space-y-2">
                  {g.items.map((o) => <Card key={o.id} o={o} now={now} anchorId={anchorFor(o)} />)}
                </ul>
              ) : (
                <div className="rounded-xl border border-dashed border-zinc-200 px-5 py-6 text-center text-sm text-zinc-400">
                  Rien à produire — semaine au calme.
                </div>
              )}
            </section>
          );
        })}
        {orders.length === 0 && (
          <p className="px-1 text-sm text-zinc-400">Les commandes confirmées apparaîtront ici, classées par date d'événement.</p>
        )}
      </div>
    </>
  );
}
