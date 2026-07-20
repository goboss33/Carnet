import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/ui";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-[transform,color,background-color,border-color,opacity] duration-150 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-zinc-900 text-white hover:bg-zinc-700",
        brand: "bg-(--color-brand) text-white hover:opacity-90",
        outline: "border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:text-zinc-900",
        ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
        destructive: "bg-red-600 text-white hover:bg-red-500",
        "destructive-outline": "border border-red-200 bg-white text-red-600 hover:border-red-400 hover:bg-red-50",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-2.5 text-[13px]",
        lg: "h-10 px-5",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { loading?: boolean }) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <Loader2 className="animate-spin" />
        </span>
      )}
      {/* le contenu garde sa place (largeur figée) même masqué pendant le chargement */}
      <span className={cn("inline-flex items-center gap-1.5", loading && "invisible")}>{children}</span>
    </button>
  );
}
export { buttonVariants };
