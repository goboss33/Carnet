"use client";

/* Onglets des réglages — contenu monté en permanence (forceMount) pour que
   le formulaire unique conserve TOUS les champs au submit, quel que soit
   l'onglet affiché. */

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Palette, Zap, Target, Wallet, Sparkles, Plug } from "lucide-react";

const TABS = [
  { id: "perso", label: "Personnalisation", Icon: Palette },
  { id: "automatismes", label: "Automatismes", Icon: Zap },
  { id: "objectifs", label: "Objectifs", Icon: Target },
  { id: "compta", label: "Compta & paiement", Icon: Wallet },
  { id: "assistant", label: "Assistant IA", Icon: Sparkles },
  { id: "integrations", label: "Intégrations", Icon: Plug },
] as const;

export default function SettingsTabs({ panels }: { panels: Record<string, React.ReactNode> }) {
  return (
    <Tabs defaultValue="perso">
      <TabsList className="sticky top-14 z-20 -mx-1 bg-(--color-surface) px-1 md:top-0">
        {TABS.map(({ id, label, Icon }) => (
          <TabsTrigger key={id} value={id}>
            <Icon /> {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {TABS.map(({ id }) => (
        <TabsContent key={id} value={id} forceMount className="pt-6 data-[state=inactive]:hidden">
          {panels[id]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
