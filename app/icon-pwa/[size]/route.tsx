import { ImageResponse } from "next/og";
import { getBrand } from "@/lib/brand";

/* Icône PWA générée à la volée — marque blanche : initiale du tenant + point
   couleur d'accent sur fond sombre (même langage que l'icône « C. » d'origine).
   Plein cadre sans transparence → compatible « maskable » (Android découpe
   lui-même la forme). Tailles servies : 180 (iOS), 192, 512. */

export const dynamic = "force-dynamic";

const SIZES = new Set([180, 192, 512]);

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = Number(raw);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });

  const brand = await getBrand();
  const letter = (brand.name.trim().charAt(0) || "C").toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#1c1917",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <div
            style={{
              color: "#fafaf9",
              fontSize: Math.round(size * 0.52),
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {letter}
          </div>
          <div
            style={{
              width: Math.round(size * 0.11),
              height: Math.round(size * 0.11),
              borderRadius: 9999,
              backgroundColor: brand.color,
              marginLeft: Math.round(size * 0.045),
              marginBottom: Math.round(size * 0.015),
            }}
          />
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=3600" },
    }
  );
}
