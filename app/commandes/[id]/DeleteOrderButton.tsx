"use client";

import { deleteOrder } from "@/app/actions";

export default function DeleteOrderButton({ orderId, name }: { orderId: string; name: string }) {
  return (
    <form
      action={deleteOrder.bind(null, orderId)}
      onSubmit={(e) => {
        if (!window.confirm(`Supprimer définitivement la fiche de ${name} ?`)) e.preventDefault();
      }}
    >
      <button className="text-xs text-stone-400 transition-colors hover:text-red-600">🗑 Supprimer cette fiche</button>
    </form>
  );
}
