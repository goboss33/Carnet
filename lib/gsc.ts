/* ---------------------------------------------------------------------------
   Google Search Console — les requêtes réelles qui affichent le site.
   Nourrit : la vigie (rapport Telegram périodique), le panneau « Idées
   venues de Google » du Studio, et le contexte SEO du wizard Journal.
   Auth : compte de service de l'agenda (scope webmasters.readonly).
   Propriété : Réglages, sinon dérivée de l'URL du site (sc-domain:host).
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

/* --------------------------------------------------------------- digest */

export type GscIdea = { query: string; impressions: number; clicks: number; position: number };
export type GscPagePerf = { path: string; clicks: number; impressions: number; position: number };
export type GscDigest = {
  topQueries: GscIdea[];
  ideas: GscIdea[]; // requêtes sans page dédiée → sujets d'articles
  journalPages: GscPagePerf[]; // performance des pages /segment/
  totalClicks: number;
  totalImpressions: number;
};

const STOP = new Set(["gateau", "gateaux", "cake", "cakes", "un", "une", "de", "des", "du", "le", "la", "les", "pour", "a", "au", "aux", "en", "et", "sur", "mesure"]);
const normQ = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/* pages « déjà couvertes » hors Journal — les piliers du site */
const PILLARS = ["anniversaire lausanne", "mariage lausanne", "wedding cake", "cupcakes lausanne", "partenaire"];

function coveredBy(queryNorm: string, haystacks: string[]): boolean {
  const words = queryNorm.split(" ").filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return true; // requête trop générique → considérée couverte
  return haystacks.some((h) => words.every((w) => h.includes(w)));
}

/* cache mémoire 30 min par tenant (l'API GSC est lente et quotée) */
const digestCache = new Map<string, { at: number; digest: GscDigest }>();

export async function gscDigest(tenantId: string, days = 90): Promise<GscDigest | null> {
  const hit = digestCache.get(`${tenantId}:${days}`);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.digest;

  const s = await getSettings(tenantId);
  if (!gscEnabled(s)) return null;
  const property = gscProperty(s);

  const [queries, pages] = await Promise.all([
    gscQuery(property, { startDate: day(days), endDate: day(0), dimensions: ["query"], rowLimit: 100 }),
    gscQuery(property, { startDate: day(days), endDate: day(0), dimensions: ["page"], rowLimit: 200 }),
  ]);
  if (!queries || !pages) return null;

  const brandFree = queries.filter((r) => !/maman|gateau\.ch/.test(normQ(r.keys[0] ?? "")));
  const topQueries: GscIdea[] = brandFree
    .slice(0, 20)
    .map((r) => ({ query: r.keys[0], impressions: r.impressions, clicks: r.clicks, position: Math.round(r.position) }));

  // pages du Journal (segment configurable) + textes couverts (piliers + pages existantes)
  const entries = await prisma.journalEntry.findMany({ select: { title: true, slug: true } });
  const covered = [...PILLARS, ...entries.map((e) => normQ(`${e.title} ${e.slug.replace(/-/g, " ")}`))];

  const ideas: GscIdea[] = brandFree
    .filter((r) => r.impressions >= 5 && (r.position > 8 || r.clicks === 0))
    .filter((r) => !coveredBy(normQ(r.keys[0] ?? ""), covered))
    .slice(0, 12)
    .map((r) => ({ query: r.keys[0], impressions: r.impressions, clicks: r.clicks, position: Math.round(r.position) }));

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
    lines.push("", "💡 <b>Idées de pages (vues mais pas de page dédiée) :</b>");
    for (const q of d.ideas.slice(0, 5)) lines.push(`• « ${q.query} » — ${q.impressions} aff., pos. ${q.position}`);
    lines.push(`→ Studio → Pages du site : chaque idée a son bouton « Créer l'article ».`);
  }
  if (d.journalPages.length) {
    lines.push("", "📰 <b>Tes pages du Journal :</b>");
    for (const p of d.journalPages.slice(0, 5)) lines.push(`• ${p.path} — ${p.clicks} clic${p.clicks > 1 ? "s" : ""}, ${p.impressions} aff.`);
  }
  if (!d.topQueries.length && !d.ideas.length) {
    lines.push("", "Encore peu de données — normal au début : chaque page publiée en apporte.");
  }
  await say(lines.join("\n"));
}
