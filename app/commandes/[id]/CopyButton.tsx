"use client";

import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {}
      }}
      className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:border-stone-500"
    >
      {ok ? "Copié ✓" : "Copier"}
    </button>
  );
}
