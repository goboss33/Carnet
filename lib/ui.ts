/* Helpers d'affichage partagés (avatars, dates relatives, badges canal). */

export const SOURCE_BADGE: Record<string, { emoji: string; label: string }> = {
  CONFIGURATEUR: { emoji: "🌐", label: "Site" },
  WHATSAPP: { emoji: "💬", label: "WhatsApp" },
  INSTAGRAM: { emoji: "📸", label: "Instagram" },
  TELEPHONE: { emoji: "📞", label: "Téléphone" },
  AUTRE: { emoji: "✍️", label: "Autre" },
};

const AVATAR_COLORS = [
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-violet-100 text-violet-800",
  "bg-orange-100 text-orange-800",
];

export function avatar(name: string) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 997;
  return { initials, color: AVATAR_COLORS[h % AVATAR_COLORS.length] };
}

/** Date relative courte, orientée production. */
export function fmtRel(d?: Date | null): { text: string; tone: "urgent" | "soon" | "normal" | "past" } {
  if (!d) return { text: "date ?", tone: "normal" };
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: d.toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }), tone: "past" };
  if (days === 0) return { text: "aujourd'hui", tone: "urgent" };
  if (days === 1) return { text: "demain", tone: "urgent" };
  if (days <= 7) return { text: `J-${days}`, tone: "soon" };
  return { text: d.toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }), tone: "normal" };
}

/* ------------------------------------------------------------- cn (design system) */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
