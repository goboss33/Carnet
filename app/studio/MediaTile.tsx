"use client";

/* ---------------------------------------------------------------------------
   MediaTile — tuile média réutilisable (bibliothèque, sélecteur du wizard,
   médias d'une fiche). Actions contextuelles révélées au survol (coin haut-
   droit), badge coin haut-gauche, pied coin bas-droit, état sélectionné.
   Le clic sur la tuile déclenche onClick (sélection ou aperçu selon le contexte).
--------------------------------------------------------------------------- */

import { cn } from "@/lib/ui";

export function TileAction({
  icon, label, onClick, active, tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  tone?: "default" | "danger" | "brand";
}) {
  return (
    <button
      type="button" title={label} aria-label={label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        "flex size-6 items-center justify-center rounded-md bg-white/90 text-zinc-600 shadow-sm backdrop-blur-sm transition-colors [&_svg]:size-3.5",
        tone === "danger" ? "hover:text-red-600" : tone === "brand" ? "hover:text-(--color-brand)" : "hover:text-zinc-900",
        active && "text-(--color-brand)"
      )}
    >
      {icon}
    </button>
  );
}

export function MediaTile({
  thumb, alt = "", selected, onClick, actions, badge, footer, className,
}: {
  thumb: string;
  alt?: string;
  selected?: boolean;
  onClick?: () => void;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const interactive = Boolean(onClick);
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
      className={cn(
        "group relative overflow-hidden rounded-lg border-2 bg-zinc-100 outline-none focus-visible:border-(--color-brand)",
        interactive && "cursor-pointer",
        selected ? "border-(--color-brand)" : "border-transparent hover:border-zinc-300",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumb} alt={alt} className="h-full w-full object-cover" draggable={false} />
      {badge && <span className="absolute left-1 top-1 flex items-center gap-1">{badge}</span>}
      {actions && <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">{actions}</div>}
      {footer && <span className="absolute bottom-1 right-1">{footer}</span>}
      {selected && <span className="pointer-events-none absolute inset-0 bg-(--color-brand)/10" />}
    </div>
  );
}
