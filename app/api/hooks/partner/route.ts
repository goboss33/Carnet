/* ---------------------------------------------------------------------------
   Webhook « candidature partenaire » — le site (mamangateau.ch/partenaires)
   pousse le formulaire ici. Auth : header x-carnet-secret (HOOK_SECRET).
--------------------------------------------------------------------------- */
import { NextRequest, NextResponse } from "next/server";
import { prisma, currentTenant } from "@/lib/db";
import { notifyAllInline } from "@/lib/telegram";
import { waLink } from "@/lib/wa";

export const dynamic = "force-dynamic";

const TYPES = ["COMMERCE", "PHOTOGRAPHE", "WEDDING_PLANNER", "SALLE", "AUTRE"] as const;
const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(req: NextRequest) {
  if (req.headers.get("x-carnet-secret") !== process.env.HOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const str = (k: string, max = 160) => String(body[k] ?? "").trim().slice(0, max);
  const business = str("business", 120);
  if (!business) return NextResponse.json({ error: "business requis" }, { status: 400 });
  const type = (TYPES as readonly string[]).includes(String(body.type)) ? (String(body.type) as (typeof TYPES)[number]) : "AUTRE";

  const tenant = await currentTenant();
  const app = await prisma.partnerApplication.create({
    data: {
      tenantId: tenant.id,
      business,
      type,
      typeLabel: str("typeLabel", 60),
      contactName: str("contactName", 80),
      phone: str("phone", 30),
      city: str("city", 60),
      message: str("message", 600),
    },
  });

  const lines = [
    `🤝 <b>Candidature partenaire — ${esc(app.business)}</b>`,
    `${esc(app.typeLabel || app.type)}${app.city ? ` · ${esc(app.city)}` : ""}`,
    app.contactName ? `👤 ${esc(app.contactName)}${app.phone ? ` · ${esc(app.phone)}` : ""}` : app.phone ? `📱 ${esc(app.phone)}` : "",
    app.message ? `\n« ${esc(app.message)} »` : "",
  ].filter(Boolean);

  const buttons: { text: string; callback_data?: string; url?: string }[][] = [];
  if (app.phone) {
    buttons.push([{ text: "📲 Répondre sur WhatsApp", url: waLink(app.phone, `Bonjour ${app.contactName || ""} ! C'est Annie de Maman Gâteau — merci pour votre message, je serais ravie d'en discuter 🧁`.replace("  ", " ")) }]);
  }
  buttons.push([{ text: "✅ Créer le partenaire", callback_data: `pa:ok:${app.id}` }]);
  buttons.push([{ text: "🗄 Décliner", callback_data: `pa:no:${app.id}` }]);

  await notifyAllInline(lines.join("\n"), buttons).catch((e) => console.error("notif partner:", e));
  return NextResponse.json({ ok: true, id: app.id });
}
