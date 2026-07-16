/* ---------------------------------------------------------------------------
   Marque du tenant (marque blanche) — nom + couleur d'accent.
   Résilient : si la base est indisponible, on retombe sur les défauts
   (la personnalisation ne doit jamais empêcher l'app de démarrer).
--------------------------------------------------------------------------- */
import { prisma, currentTenant } from "@/lib/db";

export type Brand = { name: string; color: string };

export const DEFAULT_BRAND: Brand = { name: "Carnet", color: "#4f46e5" };

export async function getBrand(): Promise<Brand> {
  try {
    const tenant = await currentTenant();
    const s = await prisma.settings.findUnique({
      where: { tenantId: tenant.id },
      select: { brandName: true, brandColor: true },
    });
    return {
      name: s?.brandName || DEFAULT_BRAND.name,
      color: /^#[0-9a-fA-F]{6}$/.test(s?.brandColor ?? "") ? (s!.brandColor as string) : DEFAULT_BRAND.color,
    };
  } catch {
    return DEFAULT_BRAND;
  }
}
