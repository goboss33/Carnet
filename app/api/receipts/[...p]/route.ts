import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ p: string[] }> }) {
  const { p } = await params;
  const base = path.resolve(process.env.RECEIPTS_DIR ?? "./data/receipts");
  const abs = path.resolve(base, ...p);
  if (!abs.startsWith(base + path.sep)) return new NextResponse("Nope", { status: 400 });
  try {
    const buf = await readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    const type =
      ext === ".pdf" ? "application/pdf"
        : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
          : ext === ".png" ? "image/png"
            : "image/webp";
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" },
    });
  } catch {
    return new NextResponse("Introuvable", { status: 404 });
  }
}
