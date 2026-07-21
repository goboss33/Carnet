"use client";

/* État de sauvegarde partagé : AutoSaveForm/AutoSelect le poussent, un petit
   témoin FLOTTANT en haut à droite l'affiche puis s'estompe tout seul. */

import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/ui";

export type SaveState = "idle" | "saving" | "saved" | "error";

const Ctx = createContext<{ state: SaveState; setSaveState: (s: SaveState) => void }>({ state: "idle", setSaveState: () => {} });

export function SaveStatusProvider({ children }: { children: React.ReactNode }) {
  const [state, setSaveState] = useState<SaveState>("idle");
  return <Ctx.Provider value={{ state, setSaveState }}>{children}</Ctx.Provider>;
}

export function useSaveStatus() {
  return useContext(Ctx);
}

/** Témoin flottant (fixe en haut à droite) : apparaît puis disparaît en fondu. */
export function SaveToast() {
  const { state, setSaveState } = useSaveStatus();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (state === "saved") { const t = setTimeout(() => setSaveState("idle"), 2200); return () => clearTimeout(t); }
    if (state === "error") { const t = setTimeout(() => setSaveState("idle"), 4000); return () => clearTimeout(t); }
  }, [state, setSaveState]);

  if (!mounted) return null;
  return createPortal(
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed right-4 top-16 z-[70] transition-opacity duration-500 md:top-6",
        state === "idle" ? "opacity-0" : "opacity-100"
      )}
    >
      {state !== "idle" && (
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-[12px] font-medium shadow-sm",
            state === "error" ? "border-red-200 text-red-600" : state === "saving" ? "border-zinc-200 text-zinc-500" : "border-emerald-200 text-emerald-700"
          )}
        >
          {state === "saving" ? (
            <><Loader2 className="size-3.5 animate-spin" /> Enregistrement…</>
          ) : state === "error" ? (
            "Erreur d'enregistrement"
          ) : (
            <><span className="inline-flex size-4 items-center justify-center rounded-full border-2 border-emerald-500 text-emerald-600"><Check className="size-2.5" /></span> Enregistré</>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
