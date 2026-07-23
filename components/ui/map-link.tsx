import { MapPin } from "lucide-react";
import { cn } from "@/lib/ui";

/* Lien d'itinéraire vers une adresse — URL universelle Google Maps : sur mobile
   elle ouvre l'app de navigation, sur desktop le site. Utilisable côté serveur
   comme client. */

export const mapsHref = (address: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;

/** Adresse raccourcie pour l'affichage (sans le pays). */
export const shortAddress = (address: string) => address.replace(/,\s*(Suisse|Switzerland|Schweiz)\s*$/i, "");

export function MapsLink({ address, className, children }: { address: string; className?: string; children?: React.ReactNode }) {
  return (
    <a
      href={mapsHref(address)}
      target="_blank"
      rel="noopener noreferrer"
      title={`Itinéraire vers ${shortAddress(address)}`}
      className={cn("inline-flex items-center gap-1 font-medium text-(--color-brand) hover:underline", className)}
    >
      {children ?? <><MapPin className="size-3.5 shrink-0" /> Itinéraire</>}
    </a>
  );
}
