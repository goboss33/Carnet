import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prismaReal?: PrismaClient };

/** Client paresseux : instancié à la première requête, jamais au build. */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    globalForPrisma.prismaReal ??= new PrismaClient();
    return Reflect.get(globalForPrisma.prismaReal, prop as keyof PrismaClient);
  },
});

/** Tenant courant (single-tenant aujourd'hui) — auto-créé au premier accès. */
export async function currentTenant() {
  const slug = process.env.TENANT_SLUG ?? "maman-gateau";
  const name = process.env.TENANT_NAME ?? "Maman Gâteau";
  return prisma.tenant.upsert({ where: { slug }, update: {}, create: { slug, name } });
}
