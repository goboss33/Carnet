"use client";

/* Champ adresse avec autocomplétion Google Places (via /api/places/autocomplete,
   clé serveur). Input NON contrôlé + ref : au choix d'une suggestion on écrit la
   valeur puis on redéclenche des événements « input »/« change » natifs — ainsi
   l'auto-save de la fiche (qui écoute les événements natifs) capte le changement,
   et un simple <form> lit bien la valeur au submit. */

import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { cn, setNativeInputValue } from "@/lib/ui";

export function AddressAutocomplete({
  name,
  defaultValue = "",
  placeholder,
  className,
  inputClassName,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 3) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: q }),
        });
        const data = await res.json();
        setItems(data.ok ? (data.suggestions ?? []) : []);
        setOpen(true);
        setHi(-1);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (v: string) => {
    if (ref.current) setNativeInputValue(ref.current, v); // setter natif → l'auto-save capte bien l'événement
    setOpen(false);
    setItems([]);
    setQ("");
  };

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
        <input
          ref={ref}
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => setQ(e.currentTarget.value)}
          onFocus={() => { if (items.length) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!open || !items.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(items.length - 1, h + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
            else if (e.key === "Enter" && hi >= 0) { e.preventDefault(); pick(items[hi]); }
            else if (e.key === "Escape") setOpen(false);
          }}
          className={cn(inputClassName, "pl-9")}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-zinc-300" />}
      </div>
      {open && items.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
          {items.map((s, i) => (
            <li key={`${s}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                onMouseEnter={() => setHi(i)}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2 text-left text-[13px]",
                  i === hi ? "bg-(--color-brand-soft) text-(--color-brand)" : "text-zinc-700 hover:bg-zinc-50",
                )}
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />
                <span>{s}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
