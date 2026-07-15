"use client";

import { useState, useTransition } from "react";
import { testTriggerAction } from "@/app/actions";

const TRIGGERS = [
  { kind: "digest", emoji: "☀️", name: "Digest du matin", desc: "Le programme de production (sorties sous 3 jours + leads en attente). Chaque jour à l'heure du digest." },
  { kind: "nudges", emoji: "🌙", name: "Relances du soir", desc: "Max 3 questions : livré ? · as-tu répondu au lead ? · des nouvelles du devis (acompte / relance WhatsApp) ? Chaque soir." },
  { kind: "reviews", emoji: "💬", name: "Machine à avis (J+2)", desc: "2 jours après une livraison : le message de demande d'avis prêt à transférer à la cliente. Avec le digest du matin." },
  { kind: "birthday", emoji: "🎂", name: "Relance anniversaire", desc: "Un an après l'événement : suggestion de recontacter la cliente pour le prochain gâteau. Avec le digest du matin." },
  { kind: "monthly", emoji: "📈", name: "Bilan mensuel (Cap)", desc: "Le 1ᵉʳ du mois : CA, net, bons points du mois, jalons — puis saisie followers/avis (pas en mode test)." },
];

export default function TriggerTests() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ kind: string; ok: boolean; message: string } | null>(null);

  const run = (kind: string) =>
    start(async () => {
      const r = await testTriggerAction(kind);
      setResult({ kind, ...r });
    });

  return (
    <div className="space-y-2.5">
      <p className="text-[13px] text-stone-500">
        Chaque test envoie les <b>vrais messages</b> sur Telegram, préfixés 🧪, sans rien marquer comme
        traité (les relances réelles resteront dues). Idéal pour vérifier le format.
      </p>
      {TRIGGERS.map((t) => (
        <div key={t.kind} className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 px-4 py-3">
          <span className="text-lg" aria-hidden>{t.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t.name}</p>
            <p className="text-xs text-stone-500">{t.desc}</p>
          </div>
          <button
            onClick={() => run(t.kind)}
            disabled={pending}
            className="rounded-lg border border-stone-300 px-3.5 py-1.5 text-xs font-semibold text-stone-600 hover:border-stone-500 disabled:opacity-50"
          >
            ▶ Tester
          </button>
          {result?.kind === t.kind && (
            <p className={`w-full text-xs font-medium ${result.ok ? "text-emerald-700" : "text-red-600"}`}>{result.message}</p>
          )}
        </div>
      ))}
    </div>
  );
}
