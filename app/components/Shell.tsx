"use client";

/* ---------------------------------------------------------------------------
   Shell — sidebar fixe (desktop) + topbar/drawer (mobile).
   Le nom de marque vient de <html data-brand-name> (réglages du tenant).
--------------------------------------------------------------------------- */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  KanbanSquare, Archive, Users, CalendarDays, Wallet, Handshake,
  Compass, Settings, LogOut, Menu, X,
} from "lucide-react";
import { logout } from "@/app/actions";
import { cn } from "@/lib/ui";

const NAV = [
  { href: "/", label: "Pipeline", Icon: KanbanSquare },
  { href: "/commandes", label: "Historique", Icon: Archive },
  { href: "/contacts", label: "Contacts", Icon: Users },
  { href: "/agenda", label: "Agenda", Icon: CalendarDays },
  { href: "/compta", label: "Compta", Icon: Wallet },
  { href: "/partenaires", label: "Partenaires", Icon: Handshake },
  { href: "/cap", label: "Cap", Icon: Compass },
];

function useBrandName() {
  const [name, setName] = useState("Carnet");
  useEffect(() => {
    setName(document.documentElement.dataset.brandName || "Carnet");
  }, []);
  return name;
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <>
      {NAV.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          className={cn(
            "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
            isActive(href)
              ? "bg-zinc-100 text-zinc-900"
              : "text-zinc-500 hover:bg-zinc-100/70 hover:text-zinc-900"
          )}
        >
          <Icon className={cn("size-4", isActive(href) ? "text-(--color-brand)" : "text-zinc-400 group-hover:text-zinc-600")} />
          {label}
        </Link>
      ))}
    </>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const brand = useBrandName();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const settingsActive = pathname.startsWith("/reglages");

  return (
    <div className="min-h-screen md:pl-56">
      {/* -------------------------------------------------- sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-(--color-line) bg-white md:flex">
        <Link href="/" className="flex h-14 items-center gap-2 border-b border-(--color-line) px-4">
          <span className="flex size-6 items-center justify-center rounded-md bg-(--color-brand) text-[13px] font-bold text-white">
            {brand.charAt(0).toUpperCase()}
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-zinc-900">{brand}</span>
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          <NavLinks pathname={pathname} />
        </nav>
        <div className="space-y-0.5 border-t border-(--color-line) p-3">
          <Link
            href="/reglages"
            className={cn(
              "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors",
              settingsActive ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:bg-zinc-100/70 hover:text-zinc-900"
            )}
          >
            <Settings className={cn("size-4", settingsActive ? "text-(--color-brand)" : "text-zinc-400 group-hover:text-zinc-600")} />
            Réglages
          </Link>
          <form action={logout}>
            <button className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100/70 hover:text-zinc-900">
              <LogOut className="size-4 text-zinc-400 group-hover:text-zinc-600" />
              Déconnexion
            </button>
          </form>
        </div>
      </aside>

      {/* -------------------------------------------------- topbar mobile */}
      <header className="sticky top-0 z-40 border-b border-(--color-line) bg-white/90 backdrop-blur md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-(--color-brand) text-[13px] font-bold text-white">
              {brand.charAt(0).toUpperCase()}
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-zinc-900">{brand}</span>
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            className="rounded-lg p-2 text-zinc-600 transition-colors hover:bg-zinc-100"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </header>

      {/* drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-zinc-950/25" onClick={() => setOpen(false)} />
          <nav className="absolute inset-x-0 top-14 space-y-0.5 border-b border-(--color-line) bg-white p-3 shadow-lg">
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            <div className="my-2 h-px bg-(--color-line)" />
            <Link href="/reglages" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-zinc-500 hover:bg-zinc-100/70 hover:text-zinc-900">
              <Settings className="size-4 text-zinc-400" /> Réglages
            </Link>
            <form action={logout}>
              <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-zinc-500 hover:bg-zinc-100/70 hover:text-zinc-900">
                <LogOut className="size-4 text-zinc-400" /> Déconnexion
              </button>
            </form>
          </nav>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 md:py-8">{children}</main>
    </div>
  );
}
