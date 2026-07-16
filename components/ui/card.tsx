import { cn } from "@/lib/ui";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-(--color-line) bg-(--color-panel)", className)} {...props} />;
}

export function CardHeader({ className, title, desc, actions }: { className?: string; title: React.ReactNode; desc?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-(--color-line) px-5 py-4", className)}>
      <div>
        <h2 className="text-[15px] font-semibold text-zinc-900">{title}</h2>
        {desc ? <p className="mt-0.5 text-[13px] text-zinc-500">{desc}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}
