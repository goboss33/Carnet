"use client";

/* ---------------------------------------------------------------------------
   Auto-save de la fiche commande. Les champs s'enregistrent tout seuls
   (débounce). L'état de sauvegarde est poussé dans SaveStatus → affiché par le
   badge de l'en-tête (près du prénom). Les actions serveur passées en prop
   font un revalidatePath sans redirect.
--------------------------------------------------------------------------- */

import { useRef } from "react";
import { useSaveStatus } from "./SaveStatus";

type Saver = (fd: FormData) => Promise<unknown>;

export function AutoSaveForm({ action, className, children }: { action: Saver; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setSaveState } = useSaveStatus();

  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const form = ref.current;
      if (!form) return;
      const fd = new FormData(form);
      setSaveState("saving");
      try { await action(fd); setSaveState("saved"); }
      catch { setSaveState("error"); }
    }, 800);
  };

  return (
    <form ref={ref} onInput={schedule} onChange={schedule} className={className}>
      {children}
    </form>
  );
}

export function AutoSelect({ action, name, defaultValue, className, children }: { action: Saver; name: string; defaultValue?: string; className?: string; children: React.ReactNode }) {
  const { setSaveState } = useSaveStatus();
  const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const fd = new FormData();
    fd.set(name, e.target.value);
    setSaveState("saving");
    try { await action(fd); setSaveState("saved"); }
    catch { setSaveState("error"); }
  };
  return (
    <select name={name} defaultValue={defaultValue} onChange={onChange} className={className}>{children}</select>
  );
}
