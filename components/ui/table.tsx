import { cn } from "@/lib/ui";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-(--color-line) bg-(--color-panel)">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-(--color-line) bg-zinc-50/60 text-left text-xs font-medium uppercase tracking-wide text-zinc-500", className)} {...props} />;
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("px-4 py-2.5 font-medium", className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-(--color-line) transition-colors last:border-0 hover:bg-zinc-50/70", className)} {...props} />;
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-2.5 align-middle text-zinc-700", className)} {...props} />;
}

export function EmptyState({ icon, title, hint, action }: { icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="animate-pop flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {icon ? (
        <div className="mb-2 flex size-14 items-center justify-center rounded-2xl bg-(--color-brand-soft) text-(--color-brand) ring-1 ring-(--color-brand)/10 [&_svg]:size-6">
          {icon}
        </div>
      ) : null}
      <p className="text-[15px] font-semibold text-zinc-700">{title}</p>
      {hint ? <p className="max-w-sm text-[13px] leading-relaxed text-zinc-400">{hint}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
