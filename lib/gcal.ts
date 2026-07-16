/* ---------------------------------------------------------------------------
   Google Agenda — synchronisation des remises de commandes.
   Dès l'acompte : événement journée entière à la date de l'événement ;
   dès que l'heure de remise (handoverAt) est fixée : événement horaire.
   Annulation : événement supprimé. Fire-and-forget : ne bloque jamais l'app.
   Auth, deux modes :
   · Compte de service (recommandé) : GCAL_SA_KEY_JSON_B64 (clé JSON encodée
     base64) + GCAL_CALENDAR_ID (l'adresse de l'agenda partagé au compte).
   · OAuth refresh token (secours) : GOOGLE_OAUTH_CLIENT_ID/SECRET +
     GCAL_REFRESH_TOKEN.
--------------------------------------------------------------------------- */
import { createSign } from "crypto";
import { prisma } from "@/lib/db";

function saKey(): { client_email: string; private_key: string } | null {
  const b64 = process.env.GCAL_SA_KEY_JSON_B64;
  if (!b64) return null;
  try {
    const j = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    return j.client_email && j.private_key ? j : null;
  } catch {
    return null;
  }
}

export function gcalEnabled(): boolean {
  return Boolean(saKey() || (process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GCAL_REFRESH_TOKEN));
}

let cachedToken: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.exp > Date.now() + 30_000) return cachedToken.token;
  try {
    const sa = saKey();
    const body = sa
      ? (() => {
          // JWT signé (service account) — RS256, scope events, valable 1 h
          const b64u = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
          const now = Math.floor(Date.now() / 1000);
          const unsigned = `${b64u({ alg: "RS256", typ: "JWT" })}.${b64u({
            iss: sa.client_email,
            scope: "https://www.googleapis.com/auth/calendar.events",
            aud: "https://oauth2.googleapis.com/token",
            iat: now,
            exp: now + 3600,
          })}`;
          const sig = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
          return new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: `${unsigned}.${sig}`,
          });
        })()
      : new URLSearchParams({
          client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
          client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
          refresh_token: process.env.GCAL_REFRESH_TOKEN!,
          grant_type: "refresh_token",
        });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body,
    });
    if (!res.ok) {
      console.error("gcal token", res.status, await res.text().catch(() => ""));
      return null;
    }
    const j = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  } catch (e) {
    console.error("gcal token", e);
    return null;
  }
}

const CAL = () => encodeURIComponent(process.env.GCAL_CALENDAR_ID || "primary");
const dateStr = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

/** Crée/met à jour/supprime l'événement d'une commande selon son état. */
export async function syncOrderEvent(orderId: string): Promise<void> {
  if (!gcalEnabled()) return;
  try {
    const o = await prisma.order.findUnique({ where: { id: orderId }, include: { contact: true, tenant: true } });
    if (!o) return;
    const s = await prisma.settings.findUnique({ where: { tenantId: o.tenantId }, select: { gcalSync: true } });
    if (s && s.gcalSync === false) return;
    const token = await accessToken();
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const shouldExist = ["ACOMPTE_RECU", "EN_PRODUCTION"].includes(o.status) && (o.eventDate || o.handoverAt);
    const justDelivered = o.status === "LIVRE"; // on laisse l'événement passé en place
    if (!shouldExist && !justDelivered) {
      if (o.gcalEventId) {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/${CAL()}/events/${o.gcalEventId}`, { method: "DELETE", headers, signal: AbortSignal.timeout(10_000) }).catch(() => null);
        await prisma.order.update({ where: { id: o.id }, data: { gcalEventId: "" } });
      }
      return;
    }
    if (!shouldExist) return;

    const name = `${o.contact.firstName} ${o.contact.lastName}`.trim();
    const isDelivery = o.deliveryMode === "livraison";
    const mode = isDelivery ? "Livraison" : "Retrait atelier";
    const body: Record<string, unknown> = {
      summary: `${mode} — ${name}${o.occasion ? ` (${o.occasion})` : ""}`,
      ...(isDelivery && o.deliveryAddress ? { location: o.deliveryAddress } : {}),
      description: [
        o.parts ? `${o.parts} parts` : "",
        o.priceQuoted ? `CHF ${o.priceQuoted}` : "",
        `${process.env.APP_URL ?? ""}/commandes/${o.id}`,
      ].filter(Boolean).join("\n"),
      // PATCH Google : toujours annuler explicitement l'autre forme (date vs dateTime),
      // sinon la bascule journée entière → horaire est refusée/ignorée.
      ...(o.handoverAt
        ? {
            start: { dateTime: o.handoverAt.toISOString(), timeZone: "Europe/Zurich", date: null },
            end: { dateTime: new Date(o.handoverAt.getTime() + 30 * 60000).toISOString(), timeZone: "Europe/Zurich", date: null },
          }
        : {
            start: { date: dateStr(o.eventDate!), dateTime: null },
            end: { date: dateStr(plusDays(o.eventDate!, 1)), dateTime: null },
          }),
    };

    const url = o.gcalEventId
      ? `https://www.googleapis.com/calendar/v3/calendars/${CAL()}/events/${o.gcalEventId}`
      : `https://www.googleapis.com/calendar/v3/calendars/${CAL()}/events`;
    const res = await fetch(url, {
      method: o.gcalEventId ? "PATCH" : "POST",
      headers,
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify(body),
    });
    if (res.status === 404 && o.gcalEventId) {
      // événement supprimé à la main côté Google : on en recrée un
      await prisma.order.update({ where: { id: o.id }, data: { gcalEventId: "" } });
      return syncOrderEvent(orderId);
    }
    if (!res.ok) {
      console.error("gcal upsert", res.status, await res.text().catch(() => ""));
      return;
    }
    const j = (await res.json()) as { id?: string };
    if (j.id && j.id !== o.gcalEventId) {
      await prisma.order.update({ where: { id: o.id }, data: { gcalEventId: j.id } });
    }
  } catch (e) {
    console.error("gcal sync", e);
  }
}
