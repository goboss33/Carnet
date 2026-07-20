import { cn } from "@/lib/ui";

/* En-tête d'écran unifié : titre + sous-titre optionnel + zone d'actions.
   Présentationnel pur (aucun hook) — utilisable côté serveur comme client. */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-[22px]">{title}</h1>
        {subtitle ? <div className="mt-0.5 text-[13px] text-zinc-500">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
