"use client";

/* ---------------------------------------------------------------------------
   Auto-save de la fiche commande. Les champs s'enregistrent tout seuls
   (débounce), avec un indicateur discret « Enregistrement… / Enregistré ✓ ».
   Les actions serveur passées en prop font un revalidatePath sans redirect.
--------------------------------------------------------------------------- */

import { useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/ui";

type Saver = (fd: FormData) => Promise<unknown>;
type State = "idle" | "saving" | "saved" | "error";

function Indicator({ state }: { state: State }) {
  if (state === "idle") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[12px] font-medium",
        state === "saving" ? "text-zinc-400" : state === "saved" ? "text-emerald-600" : "text-red-600"
      )}
    >
      {state === "saving" ? (
        <><Loader2 className="size-3.5 animate-spin" /> Enregistrement…</>
      ) : state === "saved" ? (
        <><Check className="size-3.5" /> Enregistré</>
      ) : (
        "Erreur — réessaie"
      )}
    </span>
  );
}

export function AutoSaveForm({ action, className, children }: { action: Saver; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<State>("idle");

  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const form = ref.current;
      if (!form) return;
      const fd = new FormData(form);
      setState("saving");
      try { await action(fd); setState("saved"); }
      catch { setState("error"); }
    }, 800);
  };

  return (
    <form ref={ref} onInput={schedule} onChange={schedule} className={className}>
      {children}
      <div className="flex h-5 items-center justify-end"><Indicator state={state} /></div>
    </form>
  );
}

export function AutoSelect({ action, name, defaultValue, className, children }: { action: Saver; name: string; defaultValue?: string; className?: string; children: React.ReactNode }) {
  const [state, setState] = useState<State>("idle");
  const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const fd = new FormData();
    fd.set(name, e.target.value);
    setState("saving");
    try { await action(fd); setState("saved"); }
    catch { setState("error"); }
  };
  return (
    <div className="flex items-center gap-2">
      <select name={name} defaultValue={defaultValue} onChange={onChange} className={className}>{children}</select>
      <Indicator state={state} />
    </div>
  );
}
