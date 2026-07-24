import Link from "next/link";
import { cn } from "@/lib/ui";

/* Bascule Mois / Année — segmented control partagé par les deux vues compta. */
export default function ViewToggle({ active, month, year }: { active: "mois" | "annee"; month: string; year: number }) {
  const now = new Date();
  const moisHref = year === now.getFullYear() ? "/compta" : `/compta?m=${year}-01`;
  const seg = "rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors";
  return (
    <div className="inline-flex rounded-lg border border-zinc-300 bg-white p-0.5">
      <Link href={active === "mois" ? `/compta?m=${month}` : moisHref} className={cn(seg, active === "mois" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800")}>
        Mois
      </Link>
      <Link href={`/compta/annee?y=${year}`} className={cn(seg, active === "annee" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800")}>
        Année
      </Link>
    </div>
  );
}
