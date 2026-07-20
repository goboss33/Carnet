import { Skeleton } from "@/components/ui/skeleton";

/* Squelette générique affiché DANS la coquille (sidebar persistante) pendant
   le rendu serveur d'une route. Reprend la trame des écrans : en-tête, cartes
   de synthèse, contenu. Next l'utilise comme fallback de Suspense. */
export default function Loading() {
  return (
    <div className="animate-page">
      <div className="mb-5 flex items-center justify-between">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px]" />
        ))}
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </div>
  );
}
