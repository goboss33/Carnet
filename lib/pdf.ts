/* ---------------------------------------------------------------------------
   Utilitaires PDF (pdf-lib). Les polices standard (Helvetica) n'encodent que
   WinAnsi (Latin-1) : un seul caractère hors jeu (’ – emoji, diacritiques
   slaves…) fait planter l'export. `safePdfText` remplace les typographiques
   courants puis translittère/neutralise le reste — à appeler au point unique
   où le texte est dessiné.
--------------------------------------------------------------------------- */

const MAP: Record<string, string> = {
  "’": "'", "‘": "'", "“": '"', "”": '"',
  "–": "-", "—": "-", "−": "-", "…": "...",
  " ": " ", "·": "-", "→": "->", "œ": "oe", "Œ": "OE",
};

export function safePdfText(s: string): string {
  let out = "";
  for (const ch of s) {
    if (MAP[ch] !== undefined) { out += MAP[ch]; continue; }
    const code = ch.codePointAt(0)!;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff)) { out += ch; continue; }
    // essaie de retirer les diacritiques (š → s), sinon neutralise
    const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const bc = base.codePointAt(0) ?? 0;
    out += (bc >= 0x20 && bc <= 0x7e) || (bc >= 0xa1 && bc <= 0xff) ? base : "?";
  }
  return out;
}
