import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/ui";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-zinc-100 text-zinc-700",
        brand: "bg-(--color-brand-soft) text-(--color-brand)",
        outline: "border border-zinc-200 text-zinc-600",
        success: "bg-emerald-50 text-emerald-700",
        warning: "bg-amber-50 text-amber-700",
        info: "bg-sky-50 text-sky-700",
        violet: "bg-violet-50 text-violet-700",
        danger: "bg-red-50 text-red-700",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/* Badges de statut du pipeline — mapping central. */
export const STATUS_BADGE: Record<string, { label: string; variant: NonNullable<VariantProps<typeof badgeVariants>["variant"]> }> = {
  LEAD: { label: "Lead", variant: "info" },
  DEVIS_ENVOYE: { label: "Devis envoyé", variant: "warning" },
  ACOMPTE_RECU: { label: "Confirmé", variant: "violet" },
  EN_PRODUCTION: { label: "En production", variant: "brand" },
  LIVRE: { label: "Livré", variant: "success" },
  ANNULE: { label: "Annulé", variant: "default" },
};
