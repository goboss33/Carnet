"use client";

/* Cloche de notifications — tout ce qui attend une action :
   tickets de dépense à compléter (→ modale partagée), dettes de fiche,
   livrées non soldées, heures de remise manquantes. Badge = total.
   Panneau en portail (échappe au transform de la page). */

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { Bell, Receipt, CircleAlert, HandCoins, Clock, X } from "lucide-react";
import { purgeEmptyDrafts } from "@/app/actions";
import { ExpenseModal, type ExpenseDraft } from "@/components/expense-modal";
import { chf } from "@/lib/money";
import { cn } from "@/lib/ui";

type Notif = {
  count: number;
  tickets: (ExpenseDraft & { id: string })[];
  debts: { id: string; name: string; count: number; first: string }[];
  unpaid: { id: string; name: string; dueCents: number; date: string }[];
  noHour: { id: string; name: string; date: string }[];
};

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-zinc-100 pt-2.5 first:border-t-0 first:pt-0">
      <p className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 [&_svg]:size-3.5">{icon} {title}</p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

const itemCls = "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-zinc-50";

export default function NotificationsBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Notif | null>(null);
  const [ticket, setTicket] = useState<ExpenseDraft | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 60, left: 8 });
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setMounted(true), []);

  // Panneau ancré SOUS la cloche (sidebar à gauche sur desktop, topbar à droite
  // sur mobile) — jamais à l'opposé de son déclencheur.
  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const width = 336; // w-[21rem]
      setPos({ top: r.bottom + 8, left: Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8) });
    }
    setOpen((v) => !v);
  };

  const load = useCallback(() => {
    fetch("/api/notifications").then((r) => (r.ok ? r.json() : null)).then((d) => d && setData(d)).catch(() => null);
  }, []);

  useEffect(() => { load(); }, [load, pathname]);
  useEffect(() => { if (open) load(); }, [open, load]);

  const goTo = (id: string) => { setOpen(false); router.push(`/commandes/${id}`); };
  const count = data?.count ?? 0;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={`Notifications${count ? ` (${count})` : ""}`}
        className="relative rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
      >
        <Bell className="size-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--color-brand) px-1 text-[10px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {ticket && <ExpenseModal row={ticket} onClose={() => setTicket(null)} onSaved={load} />}

      {mounted && open && createPortal(
        <div className="fixed inset-0 z-[70]" role="dialog" aria-label="Notifications">
          <div className="absolute inset-0" onClick={() => setOpen(false)} />
          <div
            style={{ top: pos.top, left: pos.left }}
            className="absolute max-h-[75vh] w-[21rem] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[13px] font-bold text-zinc-900">À traiter</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="size-4" /></button>
            </div>

            {!data || data.count === 0 ? (
              <p className="px-1 py-6 text-center text-[13px] text-zinc-400">Tout est traité — rien en attente.</p>
            ) : (
              <div className="space-y-2.5">
                {data.tickets.length > 0 && (
                  <Section icon={<Receipt />} title={`Tickets à compléter (${data.tickets.length})`}>
                    {data.tickets.map((t) => (
                      <li key={t.id}>
                        <button type="button" onClick={() => setTicket(t)} className={itemCls}>
                          <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{t.merchant || "Commerçant ?"}</span>
                          <span className="shrink-0 tabular-nums text-zinc-500">{t.totalCents ? chf(t.totalCents) : "CHF ?"}</span>
                        </button>
                      </li>
                    ))}
                    <li className="px-2 pt-0.5">
                      <button
                        type="button"
                        onClick={async () => { await purgeEmptyDrafts(); load(); }}
                        className="text-[11px] text-zinc-400 underline-offset-2 hover:text-zinc-700 hover:underline"
                      >
                        Vider les brouillons vides
                      </button>
                    </li>
                  </Section>
                )}

                {data.debts.length > 0 && (
                  <Section icon={<CircleAlert />} title={`Infos manquantes (${data.debts.length})`}>
                    {data.debts.map((d) => (
                      <li key={d.id}>
                        <button type="button" onClick={() => goTo(d.id)} className={itemCls}>
                          <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{d.name}</span>
                          <span className="shrink-0 truncate text-[11px] text-amber-600">{d.first}{d.count > 1 ? ` +${d.count - 1}` : ""}</span>
                        </button>
                      </li>
                    ))}
                  </Section>
                )}

                {data.unpaid.length > 0 && (
                  <Section icon={<HandCoins />} title={`À encaisser (${data.unpaid.length})`}>
                    {data.unpaid.map((u) => (
                      <li key={u.id}>
                        <button type="button" onClick={() => goTo(u.id)} className={itemCls}>
                          <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{u.name}</span>
                          <span className="shrink-0 text-[11px] text-zinc-400">{u.date}</span>
                          <span className="shrink-0 font-semibold tabular-nums text-amber-600">{chf(u.dueCents)}</span>
                        </button>
                      </li>
                    ))}
                  </Section>
                )}

                {data.noHour.length > 0 && (
                  <Section icon={<Clock />} title={`Heure de remise à fixer (${data.noHour.length})`}>
                    {data.noHour.map((n) => (
                      <li key={n.id}>
                        <button type="button" onClick={() => goTo(n.id)} className={itemCls}>
                          <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{n.name}</span>
                          <span className={cn("shrink-0 text-[11px] font-medium text-amber-600")}>{n.date} · --:--</span>
                        </button>
                      </li>
                    ))}
                  </Section>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
