"use client";

import { useState, useTransition } from "react";
import { testTriggerAction } from "@/app/actions";
import { AUTOMATIONS, LIFECYCLE, type Automation } from "@/lib/automations";

const inputCls =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)";

type Props = {
  /** état effectif des toggles (cronDigest, …) */
  toggles: Record<string, boolean>;
  /** valeurs enregistrées en base (null = défaut) pour les heures + délais */
  raw: Record<string, number | null>;
  /** valeurs effectives, servent de placeholder */
  eff: Record<string, number>;
  /** état live par automatisme (id → lignes), calculé côté serveur */
  live?: Record<string, string[]>;
};

/* ---------------------------------------------------- frise cycle de vie */
function Lifecycle() {
  const byStage = (i: number) => AUTOMATIONS.filter((a) => a.stage === i);
  return (
    <div className="mb-5 overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <div className="flex min-w-max items-start">
        {LIFECYCLE.map((step, i) => (
          <div key={step} className="flex items-start">
            <div className="flex flex-col items-center gap-1.5">
              <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                {step}
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              <div className="flex h-5 gap-1 text-sm leading-none">
                {byStage(i).map((a) => (
                  <span key={a.id} title={`${a.name} — ${a.trigger}`} className="cursor-help">
                    {a.emoji}
                  </span>
                ))}
              </div>
            </div>
            {i < LIFECYCLE.length - 1 && (
              <span className="mx-2 mt-4 h-px w-6 shrink-0 bg-zinc-300 sm:w-9" aria-hidden />
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">
        Le parcours d'une commande — chaque emoji est un automatisme qui veille sur cette étape (survole-les).
      </p>
    </div>
  );
}

/* --------------------------------------------------------- carte ⏰ cron */
function CronCard({
  a,
  toggles,
  raw,
  eff,
  pending,
  result,
  onTest,
  liveLines,
}: {
  a: Automation;
  toggles: Record<string, boolean>;
  raw: Record<string, number | null>;
  eff: Record<string, number>;
  pending: boolean;
  result: { kind: string; ok: boolean; message: string } | null;
  onTest: (kind: string) => void;
  liveLines?: string[];
}) {
  return (
    <div className="rounded-xl border border-zinc-200 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg" aria-hidden>{a.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{a.name}</p>
          <p className="text-xs text-zinc-500">{a.desc}</p>
          <p className="mt-0.5 text-[11px] font-medium text-zinc-500">{a.trigger}</p>
        </div>
        {a.setting && (
          <label className="relative inline-flex cursor-pointer items-center" title="Actif / inactif (pense à Enregistrer)">
            <input type="checkbox" name={a.setting} defaultChecked={toggles[a.setting]} className="peer sr-only" />
            <span className="h-5 w-9 rounded-full bg-zinc-300 transition-colors peer-checked:bg-emerald-500" />
            <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
          </label>
        )}
        {a.testKind && (
          <button
            type="button"
            onClick={() => onTest(a.testKind!)}
            disabled={pending}
            className="rounded-lg border border-zinc-300 px-3.5 py-1.5 text-xs font-semibold text-zinc-600 hover:border-zinc-500 disabled:opacity-50"
          >
            ▶ Tester
          </button>
        )}
      </div>

      {liveLines && liveLines.length > 0 && (
        <div className="mt-2.5 rounded-lg bg-zinc-50 px-3 py-2">
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">En ce moment</p>
          {liveLines.map((l, i) => (
            <p key={i} className="text-[11px] leading-relaxed text-zinc-500">{l}</p>
          ))}
        </div>
      )}

      {result && result.kind === a.testKind && (
        <p className={`mt-2 text-xs font-medium ${result.ok ? "text-emerald-700" : "text-red-600"}`}>
          {result.message}
        </p>
      )}

      {a.delays?.length ? (
        <div className="mt-3 grid gap-3 border-t border-dashed border-zinc-200 pt-3 sm:grid-cols-2">
          {a.delays.map((d) => (
            <label key={d.name} className="block">
              <span className="mb-1 block text-[11px] font-semibold text-zinc-500">
                {d.label} {d.unit && <span className="text-zinc-400">({d.unit})</span>}
              </span>
              <input
                name={d.name}
                type="number"
                min={d.min}
                max={d.max}
                defaultValue={raw[d.name] ?? ""}
                placeholder={String(eff[d.name] ?? d.def)}
                className={inputCls}
              />
            </label>
          ))}
        </div>
      ) : null}

      {a.example && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-zinc-400 hover:text-zinc-600">
            Voir un exemple de message
          </summary>
          <pre className="mt-1.5 whitespace-pre-wrap rounded-lg bg-zinc-100 px-3 py-2 font-sans text-xs text-zinc-600">
            {a.example}
          </pre>
        </details>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- section */
export default function AutomationsSection({ toggles, raw, eff, live }: Props) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ kind: string; ok: boolean; message: string } | null>(null);

  const onTest = (kind: string) =>
    start(async () => {
      const r = await testTriggerAction(kind);
      setResult({ kind, ...r });
    });

  const crons = AUTOMATIONS.filter((a) => a.family === "cron");
  const reactions = AUTOMATIONS.filter((a) => a.family === "reaction");
  const commands = AUTOMATIONS.filter((a) => a.family === "command");

  return (
    <div className="space-y-6">
      <Lifecycle />

      {/* ⏰ programmés */}
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
          Programmés — le bot vient vers toi
        </p>
        <div className="mb-3 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-[11px] font-semibold text-zinc-500">Heure du digest matin (0-23)</span>
            <input name="digestHour" type="number" min="0" max="23" defaultValue={raw.digestHour ?? ""} placeholder={String(eff.digestHour)} className={inputCls} />
          </label>
          <label>
            <span className="mb-1 block text-[11px] font-semibold text-zinc-500">Heure des relances du soir (0-23)</span>
            <input name="nudgeHour" type="number" min="0" max="23" defaultValue={raw.nudgeHour ?? ""} placeholder={String(eff.nudgeHour)} className={inputCls} />
          </label>
        </div>
        <div className="space-y-2.5">
          {crons.map((a) => (
            <CronCard key={a.id} a={a} toggles={toggles} raw={raw} eff={eff} pending={pending} result={result} onTest={onTest} liveLines={live?.[a.id]} />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">
          🧪 Un test envoie les vrais messages (préfixés 🧪), boutons désactivés, aucun état marqué — et répond
          toujours, même sans cas éligible. Toggles et délais s'appliquent après « Enregistrer ».
        </p>
      </div>

      {/* ⚡ réactions */}
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
          Réactions — déclenchées par un événement
        </p>
        <div className="space-y-2.5">
          {reactions.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3">
              <span className="text-lg" aria-hidden>{a.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{a.name}</p>
                <p className="text-xs text-zinc-500">{a.desc}</p>
                <p className="mt-0.5 text-[11px] font-medium text-zinc-500">{a.trigger}</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                Toujours actif
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 🎂 à la demande */}
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
          À la demande — le clavier du bot
        </p>
        <div className="overflow-hidden rounded-xl border border-zinc-200">
          {commands.map((a, i) => (
            <div key={a.id} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-zinc-100" : ""}`}>
              <span aria-hidden>{a.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {a.name} <span className="ml-1 text-[11px] font-medium text-zinc-400">{a.trigger}</span>
                </p>
                <p className="text-xs text-zinc-500">{a.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
