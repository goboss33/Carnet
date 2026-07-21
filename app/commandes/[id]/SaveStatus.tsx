"use client";

/* État de sauvegarde partagé : AutoSaveForm/AutoSelect le poussent, le badge
   dans l'en-tête (près du prénom) l'affiche. */

import { createContext, useContext, useState } from "react";
import { Check, Loader2, AlertCircle } from "lucide-react";

export type SaveState = "idle" | "saving" | "saved" | "error";

const Ctx = createContext<{ state: SaveState; setSaveState: (s: SaveState) => void }>({ state: "idle", setSaveState: () => {} });

export function SaveStatusProvider({ children }: { children: React.ReactNode }) {
  const [state, setSaveState] = useState<SaveState>("idle");
  return <Ctx.Provider value={{ state, setSaveState }}>{children}</Ctx.Provider>;
}

export function useSaveStatus() {
  return useContext(Ctx);
}

export function SaveStatusBadge() {
  const { state } = useSaveStatus();
  if (state === "idle") return null;
  if (state === "saving") return <Loader2 className="size-4 animate-spin text-zinc-400" aria-label="Enregistrement en cours" />;
  if (state === "error")
    return <span title="Erreur d'enregistrement" className="inline-flex size-5 items-center justify-center rounded-full bg-red-100 text-red-600"><AlertCircle className="size-3.5" /></span>;
  return <span title="Enregistré" className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="size-3.5" /></span>;
}
