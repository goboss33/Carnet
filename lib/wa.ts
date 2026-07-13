/** Lien WhatsApp cliquable : ouvre la conversation avec le message pré-rempli.
    Pur (ni serveur ni client spécifique) → réutilisable partout. */
export function waLink(phone: string, text: string): string {
  const num = (phone ?? "").replace(/\D/g, "");
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
