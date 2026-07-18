/* ---------------------------------------------------------------------------
   DataForSEO — mots-clés du wizard Journal, ciblage Suisse / français.
   v2 : API Labs (keyword_suggestions ancrées sur la PHRASE complète +
   related), variations locales par ville, et un conseil déterministe
   (« thème+ville ≈ 0 → cible occasion+ville, différencie-toi sur la
   page »). Jamais d'IA dans la boucle : graines = champs structurés,
   choix = humain. Auth : DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD.
--------------------------------------------------------------------------- */

const LOCATION_CH = 2756;
const LANG = "fr";
const CITIES = ["lausanne", "genève", "vevey", "montreux", "morges"];
/* enseignes & intentions DIY — pas des clientes (elles cherchent une recette, pas une pâtissière) */
const NOISE = /migros|coop|carrefour|lidl|aldi|manor|thermomix|marmiton|recette|facile|coloriage|dessin|tuto|maison\b/;

export function dfsEnabled(): boolean {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

function auth(): string {
  return "Basic " + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");
}

async function dfsPost<T>(path: string, payload: object): Promise<T[] | null> {
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
    return (task?.result ?? []) as T[];
  } catch (e) {
    console.error("dataforseo", e);
    return null;
  }
}

export type KeywordIdea = { keyword: string; volume: number; difficulty: number | null; intent: string | null };
export type KeywordFindings = { specific: KeywordIdea[]; local: KeywordIdea[]; advice: string | null };

type LabsItem = {
  keyword?: string;
  keyword_info?: { search_volume?: number | null };
  keyword_properties?: { keyword_difficulty?: number | null };
  search_intent_info?: { main_intent?: string | null };
};
type LabsResult = { items?: LabsItem[] };
type RelatedResult = { items?: { keyword_data?: LabsItem }[] };
type AdsVolume = { keyword?: string; search_volume?: number | null };

const toIdea = (it: LabsItem): KeywordIdea | null => {
  const kw = (it.keyword ?? "").trim().toLowerCase();
  if (!kw) return null;
  return {
    keyword: kw,
    volume: it.keyword_info?.search_volume ?? 0,
    difficulty: it.keyword_properties?.keyword_difficulty ?? null,
    intent: it.search_intent_info?.main_intent ?? null,
  };
};

const cache = new Map<string, { at: number; f: KeywordFindings }>();

/** Idées ancrées sur la phrase principale + variations locales + conseil. */
export async function keywordFindings(main: string, theme: string, occasion: string): Promise<KeywordFindings | null> {
  const seed = main.trim().toLowerCase();
  if (seed.length < 4) return { specific: [], local: [], advice: null };
  const key = `${seed}|${theme}|${occasion}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.f;

  const cityKws = [
    ...CITIES.map((c) => `gâteau ${occasion} ${c}`),
    ...(theme ? CITIES.slice(0, 3).map((c) => `gâteau ${theme} ${c}`) : []),
  ];

  const [sugg, related, cities] = await Promise.all([
    dfsPost<LabsResult>("dataforseo_labs/google/keyword_suggestions/live", {
      keyword: seed,
      location_code: LOCATION_CH,
      language_code: LANG,
      include_seed_keyword: true,
      limit: 25,
    }),
    dfsPost<RelatedResult>("dataforseo_labs/google/related_keywords/live", {
      keyword: theme ? `gâteau ${theme}` : seed,
      location_code: LOCATION_CH,
      language_code: LANG,
      depth: 1,
      limit: 15,
    }),
    dfsPost<AdsVolume>("keywords_data/google_ads/search_volume/live", {
      keywords: cityKws,
      location_code: LOCATION_CH,
      language_code: LANG,
    }),
  ]);
  if (!sugg && !related && !cities) return null;

  const seen = new Set<string>();
  const specific: KeywordIdea[] = [];
  const pool: (KeywordIdea | null)[] = [
    ...(sugg?.[0]?.items ?? []).map(toIdea),
    ...(related?.[0]?.items ?? []).map((r) => (r.keyword_data ? toIdea(r.keyword_data) : null)),
  ];
  for (const i of pool) {
    if (!i || seen.has(i.keyword) || NOISE.test(i.keyword)) continue;
    seen.add(i.keyword);
    specific.push(i);
  }
  specific.sort((a, b) => b.volume - a.volume);

  const local: KeywordIdea[] = (cities ?? [])
    .map((c) => ({ keyword: (c.keyword ?? "").toLowerCase(), volume: c.search_volume ?? 0, difficulty: null, intent: null }))
    .filter((i) => i.keyword)
    .sort((a, b) => b.volume - a.volume);

  // conseil déterministe : thème+ville mort ? cible occasion+ville, le thème différencie la page
  let advice: string | null = null;
  if (theme) {
    const themeCity = Math.max(0, ...local.filter((l) => l.keyword.includes(theme)).map((l) => l.volume));
    const occCity = Math.max(0, ...local.filter((l) => !l.keyword.includes(theme)).map((l) => l.volume));
    if (themeCity < 10 && occCity >= 50) {
      advice = `« ${theme} + ville » n'a presque pas de volume : vise « gâteau ${occasion} + ville » (jusqu'à ${occCity}/mois) et laisse le thème « ${theme} » différencier le titre et le contenu de la page.`;
    }
  }

  const f: KeywordFindings = { specific: specific.slice(0, 14), local: local.slice(0, 8), advice };
  cache.set(key, { at: Date.now(), f });
  return f;
}
