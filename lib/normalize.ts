/* Normalisation des identifiants de contact — LA défense anti-doublons.
   Toujours appliquer avant écriture ET avant recherche. */

export function normPhone(raw: string): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) return "+" + d.slice(2);
  if ((d.startsWith("41") || d.startsWith("33")) && d.length >= 11) return "+" + d;
  if (d.startsWith("0") && d.length === 10) return "+41" + d.slice(1);
  if (d.length === 9) return "+41" + d; // 79 123 45 67
  return "+" + d;
}

export const normEmail = (e: string) => (e ?? "").trim().toLowerCase();

/** Retrouve un contact par téléphone ou e-mail normalisés. */
export function contactWhere(tenantId: string, phone: string, email: string) {
  const p = normPhone(phone);
  const m = normEmail(email);
  const or: { phone?: string; email?: string }[] = [];
  if (p) or.push({ phone: p });
  if (m) or.push({ email: m });
  return or.length ? { tenantId, OR: or } : null;
}
