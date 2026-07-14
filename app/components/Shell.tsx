"use client";

/* ---------------------------------------------------------------------------
   Shell — en-tête d'application : nav desktop + burger/drawer mobile.
--------------------------------------------------------------------------- */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/actions";

const NAV = [
  { href: "/", label: "Pipeline", emoji: "📋" },
  { href: "/commandes", label: "Historique", emoji: "🗂" },
  { href: "/contacts", label: "Contacts", emoji: "👥" },
  { href: "/agenda", label: "Agenda", emoji: "📅" },
  { href: "/compta", label: "Compta", emoji: "💰" },
  { href: "/partenaires", label: "Partenaires", emoji: "🤝" },
  { href: "/cap", label: "Cap", emoji: "📈" },
  { href: "/reglages", label: "Réglages", emoji: "⚙️" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-5">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Carnet<span className="text-amber-600">.</span>
          </Link>

          {/* Nav desktop */}
          <nav className="hidden items-center gap-1 text-sm font-medium text-stone-600 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  isActive(n.href) ? "bg-stone-100 font-semibold text-stone-900" : "hover:bg-stone-100 hover:text-stone-900"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <form action={logout} className="ml-auto hidden md:block">
            <button className="text-sm text-stone-400 transition-colors hover:text-stone-700">Déconnexion</button>
          </form>

          {/* Burger mobile */}
          <button
            onClick={() => setOpen(true)}
            aria-label="Ouvrir le menu"
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg border border-stone-200 md:hidden"
          >
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1h16M1 7h16M1 13h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* Drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-stone-100 px-5">
              <p className="text-lg font-bold">Carnet<span className="text-amber-600">.</span></p>
              <button onClick={() => setOpen(false)} aria-label="Fermer" className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-stone-400">
                ×
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-[15px] font-semibold transition-colors ${
                    isActive(n.href) ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  <span aria-hidden>{n.emoji}</span>
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="border-t border-stone-100 p-3">
              <form action={logout}>
                <button className="w-full rounded-xl px-4 py-3 text-left text-[15px] font-semibold text-stone-400 hover:bg-stone-50 hover:text-stone-700">
                  Déconnexion
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-5 sm:py-8">{children}</main>
    </div>
  );
}
