"use client";

/* Rangée de statuts défilante : cadre sur le statut actif au chargement
   (sinon un statut avancé — ex. « Livré » — reste hors écran à droite). */

import { useEffect, useRef } from "react";

export function StatusScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const active = box.querySelector<HTMLElement>("[data-active='true']");
    if (active) box.scrollLeft = active.offsetLeft - box.clientWidth / 2 + active.clientWidth / 2;
  }, []);
  return (
    <div ref={ref} className="mb-6 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}
