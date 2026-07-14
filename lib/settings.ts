/* ---------------------------------------------------------------------------
   Réglages effectifs d'un tenant : valeur en base > variable d'env > défaut.
   Source unique pour la compta, le cron et le calcul d'acompte.
--------------------------------------------------------------------------- */

import { prisma } from "@/lib/db";

export type EffectiveSettings = {
  kmRate: number;
  depositPct: number;
  digestHour: number;
  nudgeHour: number;
  cronDigest: boolean;
  cronEveningNudges: boolean;
  cronReviews: boolean;
  cronBirthday: boolean;
  reviewUrl: string;
};

export async function getSettings(tenantId: string): Promise<EffectiveSettings> {
  const s = await prisma.settings.findUnique({ where: { tenantId } });
  return {
    kmRate: s?.kmRate ?? (Number(process.env.DEDUCT_KM_RATE ?? 0.7) || 0.7),
    depositPct: s?.depositPct ?? 30,
    digestHour: s?.digestHour ?? Number(process.env.DIGEST_HOUR ?? 7),
    nudgeHour: s?.nudgeHour ?? Number(process.env.NUDGE_HOUR ?? 20),
    cronDigest: s?.cronDigest ?? true,
    cronEveningNudges: s?.cronEveningNudges ?? true,
    cronReviews: s?.cronReviews ?? true,
    cronBirthday: s?.cronBirthday ?? true,
    reviewUrl: s?.reviewUrl || process.env.GOOGLE_REVIEW_URL || "",
  };
}
