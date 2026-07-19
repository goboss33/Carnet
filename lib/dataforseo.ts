/* ---------------------------------------------------------------------------
   DataForSEO — EN RÉSERVE (v2 du wizard) : les mots-clés Gemini validés
   par l'humain serviront de graines pour quantifier les volumes ici.
   Module autonome, aucun câblage UI pour l'instant — décision produit.

   Mots-clés du wizard Journal, ciblage Suisse / français.
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

const deaccent = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

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
      console.error("dataforseo http", path, res.status, await res.text().catch(() => ""));
      return null;
    }
    const j = await res.json();
    const task = j?.tasks?.[0];
    if (task?.status_code && task.status_code >= 40000) {
      console.error("dataforseo task", path, task.status_code, task.status_message);
      return null;
    }
    const result = (task?.result ?? []) as T[];
    // diagnostic : combien d'items chaque endpoint rapporte réellement
    const n = Array.isArray(result) ? result.reduce((acc: number, r) => acc + ((r as { items?: unknown[] })?.items?.length ?? (r ? 1 : 0)), 0) : 0;
    console.log("dataforseo", path, "→", n, "items");
    return result;
  } catch (e) {
    console.error("dataforseo", path, e);
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

/** Idées ancrées sur la phrase principale + variations locales + conseil.
    Méthode calquée sur l'usage expert : seeds SANS accents, related sur la
    phrase complète, pertinence avant volume, pivot keyword_ideas si le
    thème+ville est mort. */
export async function keywordFindings(main: string, theme: string, occasion: string): Promise<KeywordFindings | null> {
  const seed = deaccent(main);
  const th = deaccent(theme);
  if (seed.length < 4) return { specific: [], local: [], advice: null };
  const key = `${seed}|${th}|${occasion}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.f;

  const cityKws = [
    ...CITIES.map((c) => deaccent(`gateau ${occasion} ${c}`)),
    ...(th ? CITIES.slice(0, 3).map((c) => deaccent(`gateau ${th} ${c}`)) : []),
  ];

  const [sugg, related, cities] = await Promise.all([
    dfsPost<LabsResult>("dataforseo_labs/google/keyword_suggestions/live", {
      keyword: seed,
      location_code: LOCATION_CH,
      language_code: LANG,
      include_serp_info: false,
      limit: 30,
    }),
    dfsPost<RelatedResult>("dataforseo_labs/google/related_keywords/live", {
      keyword: seed,
      location_code: LOCATION_CH,
      language_code: LANG,
      include_serp_info: false,
      limit: 30,
    }),
    dfsPost<AdsVolume>("keywords_data/google_ads/search_volume/live", {
      keywords: cityKws,
      location_code: LOCATION_CH,
      language_code: LANG,
    }),
  ]);
  if (!sugg && !related && !cities) return null;

  // pertinence d'abord : contiennent le thème → « spécifiques » ; le reste → vivier générique
  const seen = new Set<string>();
  const specific: KeywordIdea[] = [];
  const genericPool: KeywordIdea[] = [];
  const pool: (KeywordIdea | null)[] = [
    ...(sugg?.[0]?.items ?? []).map(toIdea),
    ...(related?.[0]?.items ?? []).map((r) => (r.keyword_data ? toIdea(r.keyword_data) : null)),
  ];
  for (const i of pool) {
    if (!i || seen.has(i.keyword) || NOISE.test(i.keyword)) continue;
    seen.add(i.keyword);
    if (th && deaccent(i.keyword).includes(th)) specific.push(i);
    else genericPool.push(i);
  }
  specific.sort((a, b) => b.volume - a.volume);
  genericPool.sort((a, b) => b.volume - a.volume);

  const cityIdeas: KeywordIdea[] = (cities ?? [])
    .map((c) => ({ keyword: (c.keyword ?? "").toLowerCase(), volume: c.search_volume ?? 0, difficulty: null, intent: null }))
    .filter((i) => i.keyword);

  // pivot expert : thème+ville mort → keyword_ideas élargit vers les vrais volumes périphériques
  const themeCityMax = Math.max(0, ...cityIdeas.filter((l) => th && deaccent(l.keyword).includes(th)).map((l) => l.volume));
  if (th && themeCityMax < 10) {
    const ideas = await dfsPost<LabsResult>("dataforseo_labs/google/keyword_ideas/live", {
      keywords: CITIES.slice(0, 2).map((c) => deaccent(`gateau ${th} ${c}`)),
      location_code: LOCATION_CH,
      language_code: LANG,
      include_serp_info: false,
      limit: 20,
    });
    for (const it of ideas?.[0]?.items ?? []) {
      const i = toIdea(it);
      if (!i || seen.has(i.keyword) || NOISE.test(i.keyword)) continue;
      seen.add(i.keyword);
      genericPool.push(i);
    }
    genericPool.sort((a, b) => b.volume - a.volume);
  }

  // « occasion + ville » : volumes mesurés + meilleures pépites génériques
  const local = [...cityIdeas.filter((l) => !th || !deaccent(l.keyword).includes(th)), ...genericPool.slice(0, 6)]
    .filter((v, idx, arr) => arr.findIndex((x) => x.keyword === v.keyword) === idx)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10);

  const occCityMax = Math.max(0, ...local.map((l) => l.volume));
  let advice: string | null = null;
  if (th && themeCityMax < 10 && occCityMax >= 50) {
    advice = `« ${theme} + ville » n'a presque pas de volume : vise « gâteau ${occasion} + ville » (jusqu'à ${occCityMax}/mois) et laisse le thème « ${theme} » différencier le titre et le contenu de la page.`;
  }

  const f: KeywordFindings = { specific: specific.slice(0, 14), local, advice };
  cache.set(key, { at: Date.now(), f });
  return f;
}
