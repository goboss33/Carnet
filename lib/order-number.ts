import { prisma } from "@/lib/db";

/* Prochain numéro de commande séquentiel pour un tenant (#0042).
   Volume solo → un simple max+1 suffit (pas de contention). */
export async function nextOrderNo(tenantId: string): Promise<number> {
  const agg = await prisma.order.aggregate({ where: { tenantId }, _max: { orderNo: true } });
  return (agg._max.orderNo ?? 0) + 1;
}
