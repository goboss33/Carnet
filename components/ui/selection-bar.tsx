"use client";

/* Barre de sélection multiple — pilule sombre flottante en bas d'écran
   (façon Linear) : compteur + actions en icônes + fermeture. Rendue via portail
   pour échapper au transform de .animate-page. Partagée par les tables
   (Contacts, Historique). */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/ui";

export function SelectionBar({ count, label, onClear, children }: { count: number; label: string; onClear: () => void; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || count === 0) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-zinc-900 py-1.5 pl-4 pr-1.5 text-white shadow-xl">
        <span className="mr-1.5 whitespace-nowrap text-[13px] font-semibold tabular-nums">
          {count} <span className="font-normal text-zinc-400">{label}</span>
        </span>
        {children}
        <span className="mx-1 h-5 w-px bg-white/15" />
        <button
          type="button"
          onClick={onClear}
          aria-label="Terminer la sélection"
          title="Terminer"
          className="flex size-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-white [&_svg]:size-4"
        >
          <X />
        </button>
      </div>
    </div>,
    document.body
  );
}

export function SelectionAction({
  icon,
  label,
  onClick,
  disabled,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-8 items-center justify-center rounded-full text-zinc-200 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-4",
        destructive && "hover:bg-red-500/15 hover:text-red-400"
      )}
    >
      {icon}
    </button>
  );
}
