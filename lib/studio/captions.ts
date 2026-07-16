/* Studio — légende + hashtags générés depuis la fiche (Gemini). */
import { prisma } from "@/lib/db";
import { geminiGenerate } from "@/lib/gemini";

const LOCAL = "#cakedesignlausanne #gateauanniversaire #lausanne #vaud #pully #patisserielausanne #suisseromande";
const NICHE = "#cakedecorating #satisfyingcake #cakeart #buttercreamcake #cakereveal #birthdaycake";

export async function generateCaption(tenantId: string, opts: { orderId?: string | null; template: string; title?: string }): Promise<{ caption: string; hashtags: string }> {
  const hashtags = `${LOCAL} ${NICHE}`;
  let context = "";
  if (opts.orderId) {
    const o = await prisma.order.findFirst({ where: { id: opts.orderId, tenantId }, include: { contact: true } });
    if (o) {
      context = [
        o.occasion ? `Occasion : ${o.occasion}` : "",
        o.celebrant ? `Pour : ${o.celebrant}${o.celebrantAge ? `, ${o.celebrantAge} ans` : ""}` : "",
        o.themeNote ? `Thème : ${o.themeNote}` : "",
        o.parts ? `${o.parts} parts` : "",
      ].filter(Boolean).join("\n");
    }
  }
  const out = await geminiGenerate({
    system: "Tu écris des légendes Instagram pour Maman Gâteau, cake designer artisanale à Pully (Suisse). Ton : chaleureux, simple, fier sans vantardise, 1 emoji max par phrase. JAMAIS de nom de famille de cliente. Termine par un appel à l'action doux vers le devis gratuit (« lien en bio »). 3-5 lignes maximum. Réponds UNIQUEMENT avec la légende, sans hashtags.",
    contents: [{ role: "user", parts: [{ text: `Template : ${opts.template}. ${opts.title ? `Sujet : ${opts.title}.` : ""}\n${context || "Pas de commande liée — légende générique sur le fait-main à Pully."}` }] }],
    temperature: 0.8,
    maxOutputTokens: 1024,
  });
  return { caption: (out ?? "Fait main à Pully, avec amour. Devis gratuit — lien en bio 🤍").trim(), hashtags };
}
