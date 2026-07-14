"use client";

import { useState, useTransition } from "react";
import { testCron } from "@/app/actions";

export default function TestCronButton() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-stone-600">Tester les relances</h2>
      <p className="mb-3 text-sm text-stone-500">
        Envoie un message de test sur Telegram maintenant et affiche ce que les crons voient (sans rien modifier).
      </p>
      <button
        type="button"
        onClick={() => start(async () => setRes(await testCron()))}
        disabled={pending}
        className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:border-stone-500 disabled:opacity-60"
      >
        {pending ? "Envoi…" : "🔔 Envoyer un test Telegram"}
      </button>
      {res && <p className={`mt-3 text-sm ${res.ok ? "text-emerald-700" : "text-red-600"}`}>{res.message}</p>}
    </div>
  );
}
