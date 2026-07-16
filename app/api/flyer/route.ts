import { NextResponse } from "next/server";
import { buildFlyer } from "@/lib/flyer";

export const dynamic = "force-dynamic";

/** Flyer générique (sans code partenaire) — boîtes, atelier, marchés. */
export async function GET() {
  const png = await buildFlyer();
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="flyer-mamangateau.png"`,
    },
  });
}
