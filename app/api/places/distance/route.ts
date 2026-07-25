import { NextRequest, NextResponse } from "next/server";
import { currentTenant } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { deliveryFee } from "@/lib/pricing";

/* ---------------------------------------------------------------------------
   POST /api/places/distance — { address } → { ok, km, fee }.
   Même moteur que le configurateur du site (Google Routes API, clé serveur
   GOOGLE_MAPS_SERVER_KEY partagée) mais l'origine, les km offerts et le tarif
   viennent des Réglages → Tarifs : changer d'atelier ou de forfait se règle
   dans l'app, sans toucher au code.
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  let address = "";
  try {
    const body = await req.json();
    address = String(body.address ?? "").slice(0, 200).trim();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad-request" }, { status: 400 });
  }
  if (address.length < 5) return NextResponse.json({ ok: false, reason: "address-too-short" }, { status: 400 });
  if (!key) return NextResponse.json({ ok: false, reason: "no-key" });

  const tenant = await currentTenant();
  const s = await getSettings(tenant.id);

  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters" },
      body: JSON.stringify({
        origin: { address: s.pricing.origin },
        destination: { address: `${address}, Suisse` },
        travelMode: "DRIVE",
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`routes ${res.status}:`, detail.slice(0, 500));
      return NextResponse.json({ ok: false, reason: `http-${res.status}` });
    }
    const data = await res.json();
    const meters = data?.routes?.[0]?.distanceMeters;
    if (typeof meters !== "number") return NextResponse.json({ ok: false, reason: "not-found" });
    const km = Math.ceil(meters / 1000);
    return NextResponse.json({ ok: true, km, fee: deliveryFee(s.pricing, km) });
  } catch (e) {
    console.error("distance:", e);
    return NextResponse.json({ ok: false, reason: "error" });
  }
}
