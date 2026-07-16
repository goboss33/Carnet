"use client";

import { useState, useTransition } from "react";
import { proposeConsignes } from "@/app/actions";

export default function ConsignesField({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const [pending, start] = useTransition();
  const [err, setErr] = useState(false);

  const propose = () =>
    start(async () => {
      setErr(false);
      const t = await proposeConsignes();
      if (t) setValue(t);
      else setErr(true);
    });

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Consignes pour l'assistant</span>
        <button type="button" onClick={propose} disabled={pending} className="text-xs font-semibold text-amber-700 hover:underline disabled:opacity-50">
          {pending ? "Rédaction…" : "✨ Proposer des consignes"}
        </button>
      </div>
      <textarea
        name="assistantInstructions"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={7}
        placeholder="Ton, règles et infos pratiques que l'assistant doit toujours respecter…"
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)"
      />
      {err && <p className="mt-1 text-[11px] text-red-600">IA indisponible (clé Gemini ?). Tu peux écrire les consignes à la main.</p>}
      <p className="mt-1 text-[11px] text-zinc-400">L'IA propose une base ; édite-la librement. Ces consignes sont suivies dans tous les messages.</p>
    </div>
  );
}
