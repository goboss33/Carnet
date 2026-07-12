"use client";

/* Shell sans server action (pour les pages client) — même rendu. */
import Link from "next/link";

const NAV = [
  { href: "/", label: "Pipeline" },
  { href: "/contacts", label: "Contacts" },
  { href: "/agenda", label: "Agenda" },
  { href: "/compta", label: "Compta" },
  { href: "/partenaires", label: "Partenaires" },
];

export default function ShellClient({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 overflow-x-auto px-4 sm:gap-6 sm:px-5">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Carnet<span className="text-amber-600">.</span>
          </Link>
          <nav className="flex items-center gap-0.5 whitespace-nowrap text-sm font-medium text-stone-600 sm:gap-1">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-1.5 transition-colors hover:bg-stone-100 hover:text-stone-900 sm:px-3">
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
    </div>
  );
}
