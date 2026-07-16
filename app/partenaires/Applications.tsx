"use client";

/* Candidatures partenaires en attente — décision depuis le web (miroir du bot). */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Check, X } from "lucide-react";
import { toast } from "sonner";
import { acceptPartnerApplication, declinePartnerApplication } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";

export type AppRow = { id: string; business: string; typeLabel: string; contactName: string; phone: string; city: string; message: string; waUrl: string | null };

export default function Applications({ apps }: { apps: AppRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!apps.length) return null;

  const act = (fn: (id: string) => Promise<{ error?: string }>, id: string, okMsg: string) =>
    start(async () => {
      const r = await fn(id);
      if (r.error) toast.error(r.error);
      else toast.success(okMsg);
      router.refresh();
    });

  return (
    <Card className="mb-8 border-(--color-brand) border-opacity-30">
      <CardBody>
        <div className="mb-3 flex items-center gap-2">
          <Badge variant="brand">{apps.length} candidature{apps.length > 1 ? "s" : ""} en attente</Badge>
          <span className="text-xs text-zinc-400">reçues via la page Partenaires du site</span>
        </div>
        <div className="space-y-3">
          {apps.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-(--color-line) px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900">
                  {a.business} <span className="font-normal text-zinc-500">· {a.typeLabel}{a.city ? ` · ${a.city}` : ""}</span>
                </p>
                <p className="text-[13px] text-zinc-500">{a.contactName}{a.phone ? ` · ${a.phone}` : ""}</p>
                {a.message ? <p className="mt-1 text-[13px] italic text-zinc-500">« {a.message} »</p> : null}
              </div>
              {a.waUrl && (
                <a href={a.waUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 text-[13px] font-medium text-zinc-700 transition-colors hover:border-zinc-400 [&_svg]:size-3.5">
                  <MessageCircle /> WhatsApp
                </a>
              )}
              <Button size="sm" variant="brand" disabled={pending} onClick={() => act(acceptPartnerApplication, a.id, `${a.business} — partenaire créé (code auto).`)}>
                <Check /> Accepter
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(declinePartnerApplication, a.id, "Candidature déclinée.")}>
                <X /> Décliner
              </Button>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
