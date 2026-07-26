import { NextResponse } from "next/server";
import { currentTenant } from "@/lib/db";
import { getSettings } from "@/lib/settings";

/* ---------------------------------------------------------------------------
   GET /api/carte-saveurs — la carte des parfums, en image.

   Dans une conversation WhatsApp, l'image envoyée dans le fil bat le lien :
   elle s'affiche sans clic, sans sortir de l'application. Annie la partage
   depuis la fiche ; ce relais évite le CORS (le fichier est hébergé sur le
   site vitrine) et force un vrai téléchargement plutôt qu'un simple aperçu.
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const FILE = "saveurs-maman-gateau.jpeg";

export async function GET() {
  try {
    const tenant = await currentTenant();
    const s = await getSettings(tenant.id);
    if (!s.siteUrl) return new NextResponse("Adresse du site non réglée", { status: 404 });

    const src = `${s.siteUrl}/images/${FILE}`;
    const r = await fetch(src, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      console.error("carte-saveurs:", src, r.status);
      return new NextResponse(`Carte introuvable sur le site (${r.status})`, { status: 502 });
    }

    return new NextResponse(await r.arrayBuffer(), {
      headers: {
        "Content-Type": r.headers.get("content-type") || "image/jpeg",
        "Content-Disposition": `attachment; filename="${FILE}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("carte-saveurs:", e);
    return new NextResponse("Carte indisponible", { status: 503 });
  }
}
