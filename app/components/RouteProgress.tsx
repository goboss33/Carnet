"use client";

/* Barre de progression fine en haut de l'écran pendant les navigations.
   Démarre au clic sur un lien interne (changement de pathname), se termine
   quand la nouvelle route est montée. Aucune dépendance externe. */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function RouteProgress() {
  const pathname = usePathname();
  const [value, setValue] = useState(0);
  const [active, setActive] = useState(false);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = () => {
    if (trickle.current) return; // déjà en cours
    if (hide.current) { clearTimeout(hide.current); hide.current = null; }
    setActive(true);
    setValue(10);
    trickle.current = setInterval(() => {
      setValue((v) => (v >= 90 ? v : Math.min(90, v + (v < 50 ? 9 : v < 75 ? 4 : 2))));
    }, 180);
  };

  const finish = () => {
    if (trickle.current) { clearInterval(trickle.current); trickle.current = null; }
    setValue(100);
    hide.current = setTimeout(() => { setActive(false); setValue(0); }, 240);
  };

  // Démarrage : clic sur un lien interne vers un AUTRE pathname, ou retour navigateur.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      const target = a.getAttribute("target");
      if (!href || href.startsWith("#") || target === "_blank" || a.hasAttribute("download")) return;
      try {
        const url = new URL(href, location.href);
        if (url.origin !== location.origin) return;
        if (url.pathname === location.pathname) return; // même page (ancre, onglet…)
      } catch { return; }
      start();
    };
    const onPop = () => start();
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  // Fin : la nouvelle route est montée (pathname a changé).
  useEffect(() => { finish(); /* eslint-disable-next-line */ }, [pathname]);
  useEffect(() => () => {
    if (trickle.current) clearInterval(trickle.current);
    if (hide.current) clearTimeout(hide.current);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px]">
      <div
        className="h-full rounded-r-full bg-(--color-brand) transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${value}%`, opacity: active ? 1 : 0, boxShadow: "0 0 8px var(--color-brand)" }}
      />
    </div>
  );
}
