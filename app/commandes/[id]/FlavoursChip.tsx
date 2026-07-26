"use client";

/* « Carte des saveurs » — Annie envoie l'IMAGE, pas le lien.

   Dans une conversation en cours, chaque clic est une occasion de perdre la
   cliente : le lien la fait sortir de WhatsApp, l'image s'affiche dans le fil
   et se zoome au doigt. Sur mobile, le bouton ouvre donc le partage natif
   (WhatsApp apparaît dans la liste, image jointe) ; ailleurs, il télécharge.
   Le lien reste accessible en second, pour l'e-mail et la bio Instagram. */

import { useState } from "react";
import { Croissant, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/ui";

const SRC = "/api/carte-saveurs";
const NAME = "saveurs-maman-gateau.jpg";

type Flash = "sent" | "copy" | null;

export default function FlavoursChip({ url }: { url: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Flash>(null);
  const [err, setErr] = useState("");

  const flash = (what: Flash) => {
    setDone(what);
    setTimeout(() => setDone(null), 1800);
  };

  const share = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(SRC);
      if (!r.ok) throw new Error(await r.text().catch(() => `Erreur ${r.status}`));
      const blob = await r.blob();
      const file = new File([blob], NAME, { type: blob.type || "image/jpeg" });

      // Partage natif : le seul chemin qui joint vraiment l'image à WhatsApp.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Carte des saveurs" });
        flash("sent");
        return;
      }

      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = NAME;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 5000);
      flash("sent");
    } catch (e) {
      // Un partage annulé par l'utilisatrice n'est pas une erreur à afficher.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setErr(e instanceof Error ? e.message : "Carte indisponible");
      setTimeout(() => setErr(""), 5000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => void share()}
        disabled={busy}
        title="Envoyer la carte des saveurs en image (WhatsApp, Instagram…)"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60",
          done === "sent"
            ? "border-emerald-600/30 bg-emerald-50 text-emerald-700"
            : err
              ? "border-red-300 bg-red-50 text-red-700"
              : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
        )}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : done === "sent" ? (
          <Check className="size-3.5" />
        ) : (
          <Croissant className="size-3.5" />
        )}
        {err || (done === "sent" ? "Envoyée" : "Carte des saveurs")}
      </button>

      {url && (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(url);
            flash("copy");
          }}
          title="Copier le lien de la page (e-mail, bio Instagram)"
          className="rounded-lg px-1.5 py-1.5 text-[11px] font-medium text-zinc-400 transition hover:text-zinc-700"
        >
          {done === "copy" ? "copié" : "lien"}
        </button>
      )}
    </span>
  );
}
