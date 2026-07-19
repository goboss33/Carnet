/* ---------------------------------------------------------------------------
   Auth Google générique par compte de service — réutilise la clé de
   l'agenda (GCAL_SA_KEY_JSON_B64), un token par scope, caché ~1 h.
   (gcal.ts garde son implémentation locale : elle porte en plus le
   fallback OAuth refresh token, spécifique à l'agenda.)
--------------------------------------------------------------------------- */
import { createSign } from "crypto";

export function serviceAccount(): { client_email: string; private_key: string } | null {
  const b64 = process.env.GCAL_SA_KEY_JSON_B64;
  if (!b64) return null;
  try {
    const j = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    return j.client_email && j.private_key ? j : null;
  } catch {
    return null;
  }
}

const cache = new Map<string, { token: string; exp: number }>();

export async function googleServiceToken(scope: string): Promise<string | null> {
  const hit = cache.get(scope);
  if (hit && hit.exp > Date.now() + 30_000) return hit.token;
  const sa = serviceAccount();
  if (!sa) return null;
  try {
    const b64u = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64u({ alg: "RS256", typ: "JWT" })}.${b64u({
      iss: sa.client_email,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })}`;
    const sig = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${sig}`,
      }),
    });
    if (!res.ok) {
      console.error("google token", scope, res.status, await res.text().catch(() => ""));
      return null;
    }
    const j = (await res.json()) as { access_token: string; expires_in: number };
    cache.set(scope, { token: j.access_token, exp: Date.now() + j.expires_in * 1000 });
    return j.access_token;
  } catch (e) {
    console.error("google token", e);
    return null;
  }
}
