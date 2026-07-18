/* Cap — progression SEO : la série Search Console (12 semaines) avec les
   publications du Journal en repères. La courbe qui montre que publier paie. */
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { gscEnabled, gscTimeseries, gscDigest } from "@/lib/gsc";
import Link from "next/link";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export default async function SeoProgress({ tenantId }: { tenantId: string }) {
  const s = await getSettings(tenantId);
  if (!gscEnabled(s)) return null;

  const [series, digest, pubs] = await Promise.all([
    gscTimeseries(tenantId, 84),
    gscDigest(tenantId, 28).catch(() => null),
    prisma.journalEntry.findMany({
      where: { tenantId, status: "PUBLIEE", publishedAt: { gte: new Date(Date.now() - 85 * 86400000) } },
      select: { publishedAt: true, title: true, slug: true },
    }),
  ]);
  if (!series || series.length < 2) return null;

  const clicks = series.map((d) => d.clicks);
  const imps = series.map((d) => d.impressions);
  const last28 = { c: sum(clicks.slice(-28)), i: sum(imps.slice(-28)) };
  const prev28 = { c: sum(clicks.slice(-56, -28)), i: sum(imps.slice(-56, -28)) };
  const delta = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : a > 0 ? 100 : 0);

  // position moyenne 7 derniers jours, pondérée par impressions
  const last7 = series.slice(-7).filter((d) => d.impressions > 0);
  const posW = last7.length ? Math.round((sum(last7.map((d) => d.position * d.impressions)) / Math.max(1, sum(last7.map((d) => d.impressions)))) * 10) / 10 : null;

  // géométrie SVG
  const W = 840, H = 150, PAD = 6;
  const n = series.length;
  const x = (i: number) => PAD + (i / (n - 1)) * (W - 2 * PAD);
  const maxI = Math.max(...imps, 1);
  const maxC = Math.max(...clicks, 1);
  const yI = (v: number) => H - PAD - (v / maxI) * (H - 2 * PAD);
  const yC = (v: number) => H - PAD - (v / maxC) * (H - 2 * PAD);
  const area = `M ${x(0)} ${H - PAD} ` + imps.map((v, i) => `L ${x(i)} ${yI(v)}`).join(" ") + ` L ${x(n - 1)} ${H - PAD} Z`;
  const line = clicks.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${yC(v)}`).join(" ");
  const idxOf = (d: Date) => series.findIndex((p) => p.date === d.toISOString().slice(0, 10));
  const marks = pubs
    .map((p) => ({ i: p.publishedAt ? idxOf(p.publishedAt) : -1, title: p.title || p.slug }))
    .filter((m) => m.i >= 0);

  const fmtD = (iso: string) => new Date(iso).toLocaleDateString("fr-CH", { day: "numeric", month: "short" });

  return (
    <div className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-600">Progression SEO — 12 semaines</h2>
        <p className="text-xs text-zinc-400">
          <span className="mr-3"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-200" /> affichages</span>
          <span className="mr-3"><span className="mr-1 inline-block h-0.5 w-3 -translate-y-0.5 rounded bg-(--color-brand)" /> clics</span>
          <span><span className="mr-1 inline-block h-3 w-0.5 -translate-y-0.5 rounded bg-amber-500" /> page publiée</span>
        </p>
      </div>
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-zinc-600">
        <span><b className="text-zinc-900">{last28.i}</b> affichages (28 j) <Delta v={delta(last28.i, prev28.i)} /></span>
        <span><b className="text-zinc-900">{last28.c}</b> clic{last28.c > 1 ? "s" : ""} (28 j) <Delta v={delta(last28.c, prev28.c)} /></span>
        {posW != null && <span>position moyenne <b className="text-zinc-900">{posW}</b> (7 j)</span>}
        <span>{pubs.length} page{pubs.length > 1 ? "s" : ""} publiée{pubs.length > 1 ? "s" : ""} sur la période</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Évolution des affichages et clics Google">
        <path d={area} fill="rgb(253 230 138 / 0.55)" />
        <path d={line} fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {marks.map((m, k) => (
          <g key={k}>
            <line x1={x(m.i)} y1={PAD} x2={x(m.i)} y2={H - PAD} stroke="rgb(245 158 11)" strokeWidth="1.5" strokeDasharray="2 3" />
            <circle cx={x(m.i)} cy={PAD + 3} r="3" fill="rgb(245 158 11)"><title>{m.title}</title></circle>
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
        <span>{fmtD(series[0].date)}</span>
        <span>{fmtD(series[n - 1].date)}</span>
      </div>

      {digest?.topQueries.length ? (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">On te trouve avec (28 j)</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-zinc-600">
            {digest.topQueries.slice(0, 5).map((q) => (
              <span key={q.query}>« {q.query} » <span className="text-zinc-400">· {q.impressions} aff. · pos. {q.position}</span></span>
            ))}
          </div>
        </div>
      ) : null}
      <p className="mt-3 text-[11px] text-zinc-400">
        Chaque trait ambré est une page du <Link href="/studio?tab=pages" className="underline">Journal</Link> publiée — la courbe raconte si l'effort paie.
      </p>
    </div>
  );
}

function Delta({ v }: { v: number }) {
  if (!v) return null;
  return <span className={`ml-0.5 text-[11px] font-semibold ${v > 0 ? "text-emerald-600" : "text-red-500"}`}>{v > 0 ? "+" : ""}{v}%</span>;
}
