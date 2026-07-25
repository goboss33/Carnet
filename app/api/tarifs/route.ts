import { NextResponse } from "next/server";
import { currentTenant } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { CUPCAKE_STEP, MINI_CUPCAKE_STEP, CUPCAKE_FOURRAGE_IDS, CUPCAKE_BISCUIT_IDS } from "@/lib/pricing";

/* ---------------------------------------------------------------------------
   GET /api/tarifs — tarifs publics du tenant, consommés par le configurateur
   du site : une hausse saisie dans Réglages → Tarifs se répercute des deux
   côtés, sans redéploiement.

   Publique et en lecture seule (ce sont les prix affichés sur le site), donc
   hors authentification — voir le matcher du middleware.
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tenant = await currentTenant();
    const s = await getSettings(tenant.id);
    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        pricing: s.pricing,
        cupcakes: {
          step: CUPCAKE_STEP,
          miniStep: MINI_CUPCAKE_STEP,
          fourrageIds: CUPCAKE_FOURRAGE_IDS,
          biscuitIds: CUPCAKE_BISCUIT_IDS,
        },
      },
      {
        headers: {
          // Le site peut mettre en cache 5 min et servir l'ancien pendant 1 h
          // si Carnet est indisponible : la boutique ne tombe jamais.
          "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (e) {
    console.error("api tarifs:", e);
    return new NextResponse("Tarifs indisponibles", { status: 503 });
  }
}
