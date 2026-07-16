import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildFlyer } from "@/lib/flyer";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id } });
  if (!partner) return new NextResponse("Partenaire introuvable", { status: 404 });
  const png = await buildFlyer({ code: partner.code });
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="flyer-${partner.code}.png"`,
    },
  });
}
