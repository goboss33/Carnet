import { NextRequest, NextResponse } from "next/server";

/* ---------------------------------------------------------------------------
   POST /api/places/autocomplete — autocomplétion d'adresse (Places API New).
   Utilise GOOGLE_MAPS_SERVER_KEY côté serveur (jamais exposée au navigateur) ;
   même clé que le configurateur du site. Body { input } → { ok, suggestions }.
   Biais : Suisse romande (cercle de 50 km autour de Pully). Sans clé : ok:false.
--------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  let input = "";
  try {
    const body = await req.json();
    input = String(body.input ?? "").slice(0, 120).trim();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!key) {
    console.warn("places: GOOGLE_MAPS_SERVER_KEY absente — autocomplétion désactivée.");
    return NextResponse.json({ ok: false, reason: "no-key", suggestions: [] });
  }
  if (input.length < 3) return NextResponse.json({ ok: false, suggestions: [] });

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify({
        input,
        languageCode: "fr",
        includedRegionCodes: ["ch"],
        locationBias: {
          circle: { center: { latitude: 46.51, longitude: 6.66 }, radius: 50000 },
        },
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      // Le message de Google est la seule façon de distinguer une clé restreinte
      // par IP (cas classique en local), une API non activée, un quota épuisé…
      const detail = await res.text().catch(() => "");
      console.error(`places ${res.status}:`, detail.slice(0, 500));
      return NextResponse.json({ ok: false, reason: `http-${res.status}`, suggestions: [] });
    }
    const data = await res.json();
    const suggestions: string[] = (data.suggestions ?? [])
      .map((s: { placePrediction?: { text?: { text?: string } } }) => s.placePrediction?.text?.text)
      .filter(Boolean)
      .slice(0, 5);
    return NextResponse.json({ ok: true, suggestions });
  } catch (e) {
    console.error("places:", e);
    return NextResponse.json({ ok: false, reason: "error", suggestions: [] });
  }
}
