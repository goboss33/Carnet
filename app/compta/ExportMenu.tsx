"use client";

/* Export compta — icône discrète sur la ligne du titre, menu CSV / PDF. */

import { useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { cn } from "@/lib/ui";

export default function ExportMenu({ csvHref, pdfHref }: { csvHref: string; pdfHref: string }) {
  const [open, setOpen] = useState(false);
  const item = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-50 [&_svg]:size-4 [&_svg]:text-zinc-400";
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Exporter"
        title="Exporter"
        aria-expanded={open}
        className={cn("rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800", open && "bg-zinc-100 text-zinc-800")}
      >
        <Download className="size-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
            <a href={csvHref} onClick={() => setOpen(false)} className={item}>
              <FileSpreadsheet /> CSV (tableur)
            </a>
            <a href={pdfHref} onClick={() => setOpen(false)} className={item}>
              <FileText /> PDF (dossier)
            </a>
          </div>
        </>
      )}
    </div>
  );
}
