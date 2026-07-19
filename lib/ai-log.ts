/* Journal des appels IA (Laboratoire) — partagé Gemini / fal.
   Fire-and-forget : ne ralentit ni ne casse jamais un appel. */
const TRIM = (x: string, n = 20000) => (x.length > n ? x.slice(0, n) + "\n… (tronqué)" : x);

export function logAiCall(kind: string, system: string, user: string, response: string | null, ok: boolean, ms: number) {
  (async () => {
    const { prisma } = await import("@/lib/db");
    await prisma.promptLog.create({ data: { kind, system: TRIM(system), user: TRIM(user), response: TRIM(response ?? ""), ok, ms } });
    if (Math.random() < 0.1) {
      const old = await prisma.promptLog.findMany({ orderBy: { createdAt: "desc" }, skip: 100, select: { id: true } });
      if (old.length) await prisma.promptLog.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    }
  })().catch(() => null);
}
