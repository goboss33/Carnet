"use client";

import { useState, useTransition } from "react";
import { testTriggerAction } from "@/app/actions";

const TRIGGERS = [
  { kind: "digest", setting: "cronDigest", emoji: "☀️", name: "Digest du matin", desc: "Le programme de production (sorties sous 3 jours + leads en attente). Chaque jour à l'heure du digest." },
  { kind: "nudges", setting: "cronEveningNudges", emoji: "🌙", name: "Relances du soir", desc: "Max 3 questions : livré ? · as-tu répondu au lead ? · des nouvelles du devis (acompte / relance) ? Chaque soir." },
  { kind: "reviews", setting: "cronReviews", emoji: "💬", name: "Machine à avis (J+2)", desc: "2 jours après une livraison : message de demande d'avis prêt à transférer. Avec le digest du matin." },
  { kind: "birthday", setting: "cronBirthday", emoji: "🎂", name: "Relance anniversaire", desc: "~3 semaines avant l'anniversaire suivant d'une commande passée. Avec le digest du matin." },
  { kind: "monthly", setting: "cronMonthly", emoji: "📈", name: "Bilan mensuel (Cap)", desc: "Le 1ᵉʳ du mois : CA, bons points, jalons — puis saisie followers/avis (pas en mode test)." },
] as const;

export default function TriggerTests({ defaults }: { defaults: Record<string, boolean> }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ kind: string; ok: boolean; message: string } | null>(null);

  const run = (kind: string) =>
    start(async () => {
      const r = await testTriggerAction(kind);
      setResult({ kind, ...r });
    });

  return (
    <div className="space-y-2.5">
      {TRIGGERS.map((t) => (
        <div key={t.kind} className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 px-4 py-3">
          <span className="text-lg" aria-hidden>{t.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t.name}</p>
            <p className="text-xs text-stone-500">{t.desc}</p>
          </div>
          {/* toggle actif/inactif — participe au formulaire Réglages */}
          <label className="relative inline-flex cursor-pointer items-center" title="Actif / inactif (pense à Enregistrer)">
            <input type="checkbox" name={t.setting} defaultChecked={defaults[t.setting]} className="peer sr-only" />
            <span className="h-5 w-9 rounded-full bg-stone-300 transition-colors peer-checked:bg-emerald-500" />
            <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
          </label>
          <button
            type="button"
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
      <p className="text-[11px] text-stone-400">
        🧪 Un test envoie les vrais messages (préfixés), boutons désactivés, aucun état marqué — et dit
        toujours quelque chose, même quand aucun cas n'est éligible. Les toggles s'appliquent après « Enregistrer ».
      </p>
    </div>
  );
}
