"use client";

/* Laboratoire IA — les prompts de l'app (templates) et les derniers appels
   réels (prompt envoyé + réponse), pour affiner sans fouiller le code. */

import { useState } from "react";
import { FlaskConical, ChevronDown } from "lucide-react";
import { cn } from "@/lib/ui";

export type PromptLogRow = {
  id: string; kind: string; system: string; user: string; response: string;
  ok: boolean; ms: number; createdAt: string;
};
export type TemplateRow = { kind: string; label: string; where: string; template: string };

const Pre = ({ children }: { children: string }) => (
  <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-900 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-zinc-100">
    {children || "(vide)"}
  </pre>
);

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="inline-flex rounded-lg border border-zinc-200 p-0.5">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={cn("rounded-md px-2.5 py-1 text-[11px] font-semibold", value === o ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800")}>
          {o}
        </button>
      ))}
    </div>
  );
}

function LogCard({ log, template }: { log: PromptLogRow; template?: TemplateRow }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("Envoyé");
  const d = new Date(log.createdAt);
  return (
    <div className="rounded-xl border border-zinc-200">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left">
        <span className={cn("size-2 shrink-0 rounded-full", log.ok ? "bg-emerald-500" : "bg-red-500")} />
        <span className="text-[13px] font-semibold text-zinc-800">{template?.label ?? log.kind}</span>
        <span className="ml-auto text-[11px] tabular-nums text-zinc-400">
          {d.toLocaleString("fr-CH", { dateStyle: "short", timeStyle: "short" })} · {(log.ms / 1000).toFixed(1)} s
        </span>
        <ChevronDown className={cn("size-4 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-zinc-100 px-3.5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented value={view} onChange={setView} options={["Envoyé", "Template", "Réponse"]} />
            {template && <span className="text-[11px] text-zinc-400">à éditer dans <code className="rounded bg-zinc-100 px-1">{template.where}</code></span>}
          </div>
          {view === "Envoyé" && <Pre>{(log.system ? `[system]\n${log.system}\n\n` : "") + `[user]\n${log.user}`}</Pre>}
          {view === "Template" && <Pre>{template?.template ?? "(pas de template au registre pour ce kind)"}</Pre>}
          {view === "Réponse" && <Pre>{log.response}</Pre>}
        </div>
      )}
    </div>
  );
}

function TemplateCard({ t }: { t: TemplateRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-zinc-200">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left">
        <span className="text-[13px] font-semibold text-zinc-800">{t.label}</span>
        <code className="rounded bg-zinc-100 px-1.5 text-[10px] text-zinc-500">{t.kind}</code>
        <ChevronDown className={cn("ml-auto size-4 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-zinc-100 px-3.5 py-3">
          <p className="text-[11px] text-zinc-400">à éditer dans <code className="rounded bg-zinc-100 px-1">{t.where}</code></p>
          <Pre>{t.template}</Pre>
        </div>
      )}
    </div>
  );
}

export default function PromptLab({ logs, templates }: { logs: PromptLogRow[]; templates: TemplateRow[] }) {
  const byKind = new Map(templates.map((t) => [t.kind, t]));
  return (
    <div className="space-y-5">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
        <FlaskConical className="size-3.5" /> Laboratoire IA — pour affiner les prompts
      </p>
      <div>
        <p className="mb-2 text-[12px] font-semibold text-zinc-600">Derniers appels réels ({logs.length})</p>
        {logs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-4 text-[13px] text-zinc-400">
            Aucun appel tracé pour l'instant — utilise l'assistant, le Journal ou envoie une capture au bot, puis reviens ici.
          </p>
        ) : (
          <div className="space-y-2">{logs.map((l) => <LogCard key={l.id} log={l} template={byKind.get(l.kind)} />)}</div>
        )}
      </div>
      <div>
        <p className="mb-2 text-[12px] font-semibold text-zinc-600">Tous les prompts de l'app ({templates.length})</p>
        <div className="space-y-2">{templates.map((t) => <TemplateCard key={t.kind} t={t} />)}</div>
      </div>
    </div>
  );
}
