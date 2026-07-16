import { currentTenant } from "@/lib/db";
import { computeCap } from "@/lib/cap";
import { toggleMilestone } from "@/app/actions";
import Shell from "@/app/components/Shell";
import Link from "next/link";

export const dynamic = "force-dynamic";

function Bar({ value, goal }: { value: number; goal: number }) {
  const pct = Math.min(100, Math.round((value / Math.max(goal, 1)) * 100));
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
      <div className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default async function Cap() {
  const tenant = await currentTenant();
  const c = await computeCap(tenant.id);
  const maxCa = Math.max(...c.caParMois.map((m) => m.ca), c.s.goalCaMensuel, 1);
  const moisLabel = (m: string) => ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"][Number(m.slice(5)) - 1];

  const kpis = [
    { label: "CA du mois (livré)", value: `CHF ${c.caMois}`, goal: c.s.goalCaMensuel, v: c.caMois, sub: `objectif ${c.s.goalCaMensuel}` },
    { label: "Résultat net du mois", value: `CHF ${c.netMois}`, goal: null, v: 0, sub: c.netMois >= 0 ? "dans le vert" : "dans le rouge" },
    { label: "Panier moyen (3 mois)", value: `CHF ${c.panierMoyen}`, goal: c.s.goalPanierMoyen, v: c.panierMoyen, sub: `objectif ${c.s.goalPanierMoyen} · ${c.chfPart} CHF/part` },
    { label: "Week-ends remplis", value: `${c.weekendsPleins}/4`, goal: 3, v: c.weekendsPleins, sub: `à venir · constance 3 mois : ${c.remplissage3mPct}%` },
    { label: "Part mariage (3 mois)", value: `${c.partMariagePct}%`, goal: c.s.goalPartMariage, v: c.partMariagePct, sub: `objectif ${c.s.goalPartMariage}%` },
    { label: "CA hors sur-mesure", value: `${c.partDecouplePct}%`, goal: c.s.goalPartDecouple, v: c.partDecouplePct, sub: "le CA qui ne dépend pas des heures" },
    { label: "Clientes qui reviennent", value: `${c.retentionPct}%`, goal: null, v: 0, sub: "≥ 2 commandes" },
    { label: "Instagram", value: c.followers.at(-1) ? String(c.followers.at(-1)!.value) : "—", goal: c.s.goalInstagram, v: c.followers.at(-1)?.value ?? 0, sub: `objectif ${c.s.goalInstagram} · saisie au bilan du bot` },
  ];

  return (
    <Shell>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Cap</h1>
        <p className="text-sm font-semibold text-amber-700">{c.phases[c.phaseCourante].name}</p>
      </div>
      <p className="mb-7 max-w-2xl text-sm text-stone-500">
        La direction, l'avancement, et rien d'autre. Les objectifs se règlent dans{" "}
        <Link href="/reglages" className="underline">Réglages</Link> — le bot fait le bilan le 1ᵉʳ de chaque mois.
      </p>

      {/* KPIs */}
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-stone-200 bg-white px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{k.label}</p>
            <p className="mt-0.5 text-xl font-bold tracking-tight">{k.value}</p>
            <p className="text-[11px] text-stone-400">{k.sub}</p>
            {k.goal != null && <Bar value={k.v} goal={k.goal} />}
          </div>
        ))}
      </div>

      {/* CA 12 mois */}
      <div className="mb-8 rounded-2xl border border-stone-200 bg-white p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-600">CA livré — 12 mois</h2>
          <p className="text-xs text-stone-400">— objectif {c.s.goalCaMensuel} CHF</p>
        </div>
        <div className="relative flex h-40 items-end gap-2">
          <div className="absolute inset-x-0 border-t border-dashed border-amber-400/60" style={{ bottom: `${(c.s.goalCaMensuel / maxCa) * 100}%` }} />
          {c.caParMois.map((mo) => (
            <div key={mo.month} className="flex flex-1 flex-col items-center gap-1" title={`${mo.month} : CHF ${mo.ca} (net ${mo.net})`}>
              <div className="flex w-full flex-1 items-end">
                <div className={`w-full rounded-t ${mo.ca >= c.s.goalCaMensuel ? "bg-emerald-400" : "bg-stone-300"}`} style={{ height: `${(mo.ca / maxCa) * 100}%` }} />
              </div>
              <span className="text-[10px] text-stone-400">{moisLabel(mo.month)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Phases */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {c.phases.map((p, i) => {
          const done = p.jalons.filter((j) => j.done).length;
          return (
            <section key={p.name} className={`rounded-2xl border bg-white p-5 ${i === c.phaseCourante ? "border-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.12)]" : "border-stone-200"}`}>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-sm font-bold">{p.name}</h2>
                <span className="text-xs font-bold text-stone-400">{done}/{p.jalons.length}</span>
              </div>
              <ul className="space-y-2">
                {p.jalons.map((j) => (
                  <li key={j.key} className="flex items-start gap-2.5 text-sm">
                    {j.auto ? (
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${j.done ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-400"}`}>
                        {j.done ? "✓" : "·"}
                      </span>
                    ) : (
                      <form action={toggleMilestone.bind(null, j.key, !j.done)}>
                        <button
                          title="Cocher / décocher"
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${j.done ? "bg-emerald-100 text-emerald-700" : "border border-stone-300 text-stone-300 hover:border-amber-500 hover:text-amber-600"}`}
                        >
                          {j.done ? "✓" : ""}
                        </button>
                      </form>
                    )}
                    <span className={j.done ? "text-stone-700" : "text-stone-500"}>
                      {j.label}
                      {j.detail && <span className="ml-1.5 text-[11px] text-stone-400">({j.detail})</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
