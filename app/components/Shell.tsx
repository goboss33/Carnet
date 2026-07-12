import Link from "next/link";
import { logout } from "@/app/actions";

const NAV = [
  { href: "/", label: "Pipeline" },
  { href: "/nouveau", label: "+ Nouveau" },
  { href: "/contacts", label: "Contacts" },
  { href: "/agenda", label: "Agenda" },
  { href: "/compta", label: "Compta" },
  { href: "/partenaires", label: "Partenaires" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-5">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Carnet<span className="text-amber-600">.</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium text-stone-600">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 transition-colors hover:bg-stone-100 hover:text-stone-900">
                {n.label}
              </Link>
            ))}
          </nav>
          <form action={logout} className="ml-auto">
            <button className="text-sm text-stone-400 transition-colors hover:text-stone-700">Déconnexion</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
    </div>
  );
}
