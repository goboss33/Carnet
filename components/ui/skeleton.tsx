import { cn } from "@/lib/ui";

/** Bloc de chargement animé (balayage). Donne la hauteur/largeur via className. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}
