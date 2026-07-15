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
  cronMonthly: boolean;
  reviewDelayDays: number;
  quoteFollowupDays: number;
  leadFollowupHours: number;
  birthdayLeadDays: number;
  nudgeCooldownDays: number;
  nudgeMaxPerEvening: number;
  reviewUrl: string;
  paymentDefault: "twint" | "virement";
  twintNumber: string;
  accountHolder: string;
  iban: string;
  bankName: string;
  assistantActive: boolean;
  assistantSignature: string;
  assistantInstructions: string;
  goalCaMensuel: number;
  goalPanierMoyen: number;
  goalAvisGoogle: number;
  goalPartMariage: number;
  goalPartDecouple: number;
  goalInstagram: number;
  milestones: Record<string, boolean>;
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
    cronMonthly: s?.cronMonthly ?? true,
    reviewDelayDays: s?.reviewDelayDays ?? 2,
    quoteFollowupDays: s?.quoteFollowupDays ?? 4,
    leadFollowupHours: s?.leadFollowupHours ?? 24,
    birthdayLeadDays: s?.birthdayLeadDays ?? 21,
    nudgeCooldownDays: s?.nudgeCooldownDays ?? 2,
    nudgeMaxPerEvening: s?.nudgeMaxPerEvening ?? 3,
    reviewUrl: s?.reviewUrl || process.env.GOOGLE_REVIEW_URL || "",
    paymentDefault: s?.paymentDefault === "virement" ? "virement" : "twint",
    twintNumber: s?.twintNumber ?? "",
    accountHolder: s?.accountHolder ?? "",
    iban: s?.iban ?? "",
    bankName: s?.bankName ?? "",
    assistantActive: s?.assistantActive ?? true,
    assistantSignature: s?.assistantSignature ?? "",
    assistantInstructions: s?.assistantInstructions ?? "",
    goalCaMensuel: s?.goalCaMensuel ?? 2500,
    goalPanierMoyen: s?.goalPanierMoyen ?? 140,
    goalAvisGoogle: s?.goalAvisGoogle ?? 25,
    goalPartMariage: s?.goalPartMariage ?? 30,
    goalPartDecouple: s?.goalPartDecouple ?? 25,
    goalInstagram: s?.goalInstagram ?? 1000,
    milestones: (s?.milestones as Record<string, boolean>) ?? {},
  };
}
