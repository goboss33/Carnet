/* Icônes Lucide du registre des automatismes (web). Map explicite = tree-shaking sain. */
import {
  Sun, Moon, MessageSquareHeart, Cake, TrendingUp, Puzzle, ChefHat,
  Inbox, Handshake, BellRing, Coins, UserCheck, Sparkles,
  CirclePlus, ScanLine, CalendarDays, Wallet, LayoutGrid, Bot, CalendarCheck,
} from "lucide-react";

export const AUTOMATION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Sun, Moon, MessageSquareHeart, Cake, TrendingUp, Puzzle, ChefHat,
  Inbox, Handshake, BellRing, Coins, UserCheck, Sparkles,
  CirclePlus, ScanLine, CalendarDays, Wallet, LayoutGrid, CalendarCheck,
};

export function AutomationIcon({ name, className }: { name: string; className?: string }) {
  const I = AUTOMATION_ICONS[name] ?? Bot;
  return <I className={className} />;
}
