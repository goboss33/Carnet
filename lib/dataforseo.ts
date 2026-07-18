/* ---------------------------------------------------------------------------
   DataForSEO — volumes de recherche et idées de mots-clés (Google Ads),
   ciblage Suisse / français. Sert le wizard du Journal : les graines
   viennent des champs structurés de la commande (jamais d'IA dans la
   boucle des mots-clés) ; l'humain choisit ; Gemini ne rédige qu'après.
   Auth : DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD (env). ~0,05 $ l'appel.
--------------------------------------------------------------------------- */

const LOCATION_CH = 2756; // Suisse
const LANG = "fr";

export function dfsEnabled(): boolean {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

function auth(): string {
  return "Basic " + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");
}

type DfsItem = { keyword?: string; search_volume?: number | null; competition?: string | null };

async function dfsPost(path: string, payload: object): Promise<DfsItem[] | null> {
  try {
    const res = await fetch(`https://api.dataforseo.com/v3/${path}`, {
      method: "POST",
      headers: { Authorization: auth(), "Content-Type": "application/json" },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify([payload]),
    });
    if (!res.ok) {
      console.error("dataforseo http", res.status, await res.text().catch(() => ""));
      return null;
    }
    const j = await res.json();
    const task = j?.tasks?.[0];
    if (task?.status_code && task.status_code >= 40000) {
      console.error("dataforseo task", task.status_code, task.status_message);
      return null;
    }
    return (task?.result ?? []) as DfsItem[];
  } catch (e) {
    console.error("dataforseo", e);
    return null;
  }
}

export type KeywordIdea = { keyword: string; volume: number; competition: string | null };

const cache = new Map<string, { at: number; ideas: KeywordIdea[] }>();

/** Volumes des graines + idées apparentées, triées par volume. Cache 24 h. */
export async function keywordIdeas(seeds: string[]): Promise<KeywordIdea[] | null> {
  const clean = [...new Set(seeds.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 2))].slice(0, 10);
  if (!clean.length) return [];
  const key = clean.sort().join("|");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.ideas;

  const [volumes, related] = await Promise.all([
    dfsPost("keywords_data/google_ads/search_volume/live", {
      keywords: clean,
      location_code: LOCATION_CH,
      language_code: LANG,
    }),
    dfsPost("keywords_data/google_ads/keywords_for_keywords/live", {
      keywords: clean.slice(0, 5),
      location_code: LOCATION_CH,
      language_code: LANG,
      sort_by: "search_volume",
    }),
  ]);
  if (!volumes && !related) return null;

  const seen = new Map<string, KeywordIdea>();
  for (const it of [...(volumes ?? []), ...(related ?? [])]) {
    const kw = (it.keyword ?? "").trim().toLowerCase();
    if (!kw || seen.has(kw)) continue;
    seen.set(kw, { keyword: kw, volume: it.search_volume ?? 0, competition: it.competition ?? null });
  }
  const ideas = [...seen.values()]
    .filter((i) => /gateau|gâteau|cake|cupcake|patisserie|pâtisserie|anniversaire|mariage|wedding/.test(i.keyword) || clean.includes(i.keyword))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 15);
  cache.set(key, { at: Date.now(), ideas });
  return ideas;
}
