/* ---------------------------------------------------------------------------
   Google Search Console — les requêtes réelles qui affichent le site.
   Tri en trois familles : à créer (nouvelle page du Journal), à renforcer
   (une page existante doit mieux porter la requête — jamais de doublon),
   ignorées (marques tierces… choix humain, mémorisé). Nourrit la vigie,
   le panneau « Idées venues de Google » et le contexte SEO du wizard.
   Auth : compte de service de l'agenda (scope webmasters.readonly).
--------------------------------------------------------------------------- */
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { googleServiceToken, serviceAccount } from "@/lib/google-auth";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export function gscProperty(s: { gscProperty: string; siteUrl: string }): string {
  if (s.gscProperty) return s.gscProperty;
  try {
    return s.siteUrl ? `sc-domain:${new URL(s.siteUrl).hostname.replace(/^www\./, "")}` : "";
  } catch {
    return "";
  }
}

export function gscEnabled(s: { gscProperty: string; siteUrl: string }): boolean {
  return Boolean(serviceAccount() && gscProperty(s));
}

type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function gscQuery(property: string, body: object): Promise<GscRow[] | null> {
  const token = await googleServiceToken(SCOPE);
  if (!token) return null;
  try {
    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      console.error("gsc query", res.status, await res.text().catch(() => ""));
      return null;
    }
    return ((await res.json())?.rows ?? []) as GscRow[];
  } catch (e) {
    console.error("gsc query", e);
    return null;
  }
}

const day = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);

/* ------------------------------------------------------- classification */

export const normQuery = (x: string) =>
  x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const STOP = new Set(["gateau", "gateaux", "cake", "cakes", "un", "une", "de", "des", "du", "le", "la", "les", "pour", "a", "au", "aux", "en", "et", "sur", "mesure", "prix", "acheter", "commander"]);
const LOC = new Set(["lausanne", "pully", "vevey", "montreux", "morges", "renens", "lutry", "cully", "ecublens", "crissier", "riviera", "vaud", "vaudois", "vaudoise", "suisse", "romande", "region", "pres", "proche"]);

/* Pages existantes hors Journal, avec les mots qu'elles doivent porter :
   une requête générique qui ne contient QUE ces mots (+ localités) doit
   renforcer la page, pas donner un doublon. */
const PILLAR_PAGES: { page: string; words: string[] }[] = [
  { page: "la page Anniversaire", words: ["anniversaire", "anniversaires", "enfant", "adulte", "ans"] },
  { page: "la page Mariage", words: ["mariage", "wedding", "mariee", "maries"] },
  { page: "la page Cupcakes", words: ["cupcake", "cupcakes"] },
  { page: "l'accueil", words: ["personnalise", "personnalisee", "personnalises", "design", "designer", "patisserie", "patissiere", "createur", "creatrice", "original", "artisanal"] },
];

/** Page existante que la requête devrait renforcer, ou null si elle mérite sa propre page. */
function pillarTarget(qn: string): string | null {
  const tokens = qn.split(" ").filter((w) => w.length > 2 && !STOP.has(w) && !LOC.has(w));
  if (!tokens.length) return "l'accueil"; // « gâteau lausanne » : rien de spécifique
  for (const p of PILLAR_PAGES) {
    if (tokens.every((w) => p.words.includes(w))) return p.page;
  }
  return null;
}

/* --------------------------------------------------------------- digest */

export type GscIdea = { query: string; impressions: number; clicks: number; position: number; target?: string };
export type GscPagePerf = { path: string; clicks: number; impressions: number; position: number };
export type GscDigest = {
  topQueries: GscIdea[];
  ideas: GscIdea[]; // → nouvelles pages du Journal
  reinforce: GscIdea[]; // → muscler une page existante (target)
  journalPages: GscPagePerf[];
  totalClicks: number;
  totalImpressions: number;
};

function coveredByJournal(qn: string, haystacks: string[]): boolean {
  const words = qn.split(" ").filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return false;
  return haystacks.some((h) => words.every((w) => h.includes(w)));
}

/* cache mémoire 30 min par tenant (l'API GSC est lente et quotée) */
const digestCache = new Map<string, { at: number; digest: GscDigest }>();
export function clearGscCache(tenantId?: string) {
  for (const k of digestCache.keys()) if (!tenantId || k.startsWith(`${tenantId}:`)) digestCache.delete(k);
}

export async function gscDigest(tenantId: string, days = 90): Promise<GscDigest | null> {
  const hit = digestCache.get(`${tenantId}:${days}`);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.digest;

  const s = await getSettings(tenantId);
  if (!gscEnabled(s)) return null;
  const property = gscProperty(s);

  const [queries, pages, raw] = await Promise.all([
    gscQuery(property, { startDate: day(days), endDate: day(0), dimensions: ["query"], rowLimit: 150 }),
    gscQuery(property, { startDate: day(days), endDate: day(0), dimensions: ["page"], rowLimit: 200 }),
    prisma.settings.findUnique({ where: { tenantId }, select: { gscIgnored: true } }),
  ]);
  if (!queries || !pages) return null;
  const ignored = new Set(((raw?.gscIgnored as string[] | null) ?? []).map(normQuery));

  // fusion des quasi-doublons (accents/casse) : même forme normalisée
  const grouped = new Map<string, { query: string; clicks: number; impressions: number; posW: number }>();
  for (const r of queries) {
    const q = r.keys[0] ?? "";
    const qn = normQuery(q);
    if (!qn || /maman gateau|mamangateau/.test(qn) || ignored.has(qn)) continue;
    const g = grouped.get(qn);
    if (g) {
      if (r.impressions > g.impressions) g.query = q; // libellé le plus vu
      g.posW += r.position * r.impressions;
      g.clicks += r.clicks;
      g.impressions += r.impressions;
    } else {
      grouped.set(qn, { query: q, clicks: r.clicks, impressions: r.impressions, posW: r.position * r.impressions });
    }
  }
  const merged = [...grouped.entries()]
    .map(([qn, g]) => ({ qn, query: g.query, clicks: g.clicks, impressions: g.impressions, position: Math.round(g.posW / Math.max(1, g.impressions)) }))
    .sort((a, b) => b.impressions - a.impressions);

  const topQueries: GscIdea[] = merged.slice(0, 20).map(({ query, impressions, clicks, position }) => ({ query, impressions, clicks, position }));

  const entries = await prisma.journalEntry.findMany({ select: { title: true, slug: true } });
  const journalTexts = entries.map((e) => normQuery(`${e.title} ${e.slug.replace(/-/g, " ")}`));

  const ideas: GscIdea[] = [];
  const reinforce: GscIdea[] = [];
  for (const m of merged) {
    if (m.impressions < 5 || (m.position <= 8 && m.clicks > 0)) continue; // déjà bien servi
    const base = { query: m.query, impressions: m.impressions, clicks: m.clicks, position: m.position };
    const target = pillarTarget(m.qn);
    if (target) {
      if (reinforce.length < 8) reinforce.push({ ...base, target });
    } else if (!coveredByJournal(m.qn, journalTexts)) {
      if (ideas.length < 10) ideas.push(base);
    }
  }

  const seg = `/${s.sitePathPrefix}/`;
  const journalPages: GscPagePerf[] = pages
    .filter((r) => (r.keys[0] ?? "").includes(seg))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10)
    .map((r) => ({
      path: (() => { try { return new URL(r.keys[0]).pathname; } catch { return r.keys[0]; } })(),
      clicks: r.clicks,
      impressions: r.impressions,
      position: Math.round(r.position),
    }));

  const digest: GscDigest = {
    topQueries,
    ideas,
    reinforce,
    journalPages,
    totalClicks: queries.reduce((n, r) => n + r.clicks, 0),
    totalImpressions: queries.reduce((n, r) => n + r.impressions, 0),
  };
  digestCache.set(`${tenantId}:${days}`, { at: Date.now(), digest });
  return digest;
}

/* ------------------------------------------------------ vigie (cron) */

export async function runGscReport(t: { id: string }, dryRun = false): Promise<void> {
  const { notifyAll } = await import("@/lib/telegram");
  const s = await getSettings(t.id);
  const say = (msg: string) => notifyAll(`${dryRun ? "🧪 " : ""}${msg}`);

  if (!gscEnabled(s)) {
    if (dryRun) await say("🔎 Vigie Search Console : renseigne l'URL du site (Réglages → Personnalisation) et vérifie que le compte de service est ajouté dans Search Console.");
    return;
  }
  const raw = await prisma.settings.findUnique({ where: { tenantId: t.id } });
  if (!dryRun) {
    const last = raw?.lastGscCheckAt?.getTime() ?? 0;
    if (Date.now() - last < s.gscCheckDays * 86400000) return;
  }

  const d = await gscDigest(t.id, s.gscCheckDays);
  if (!d) {
    if (dryRun) await say("🔎 Vigie Search Console : Google ne répond pas — vérifie que l'API est activée et le compte de service autorisé dans la propriété.");
    return;
  }
  if (!dryRun) await prisma.settings.update({ where: { tenantId: t.id }, data: { lastGscCheckAt: new Date() } }).catch(() => null);

  const lines = [
    `🔎 <b>Search Console — ${s.gscCheckDays} derniers jours</b>`,
    `${d.totalClicks} clic${d.totalClicks > 1 ? "s" : ""} · ${d.totalImpressions} affichages sur Google`,
  ];
  if (d.topQueries.length) {
    lines.push("", "<b>On te cherche avec :</b>");
    for (const q of d.topQueries.slice(0, 5)) lines.push(`• « ${q.query} » — ${q.impressions} aff., pos. ${q.position}`);
  }
  if (d.ideas.length) {
    lines.push("", "💡 <b>À créer (vues, pas de page dédiée) :</b>");
    for (const q of d.ideas.slice(0, 5)) lines.push(`• « ${q.query} » — ${q.impressions} aff., pos. ${q.position}`);
    lines.push("→ Studio → Pages du site : bouton « Créer l'article » (ou Ignorer).");
  }
  if (d.reinforce.length) {
    lines.push("", "🛠 <b>À renforcer (page existante) :</b>");
    for (const q of d.reinforce.slice(0, 4)) lines.push(`• « ${q.query} » — ${q.impressions} aff., pos. ${q.position} → ${q.target}`);
  }
  if (d.journalPages.length) {
    lines.push("", "📰 <b>Tes pages du Journal :</b>");
    for (const p of d.journalPages.slice(0, 5)) lines.push(`• ${p.path} — ${p.clicks} clic${p.clicks > 1 ? "s" : ""}, ${p.impressions} aff.`);
  }
  if (!d.topQueries.length && !d.ideas.length && !d.reinforce.length) {
    lines.push("", "Encore peu de données — normal au début : chaque page publiée en apporte.");
  }
  await say(lines.join("\n"));
}
