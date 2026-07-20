"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form action={action} className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-2xl font-bold tracking-tight">Carnet</p>
        <p className="mt-1 text-sm text-zinc-500">Le back-office de Maman Gâteau</p>
        <label className="mt-6 block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Mot de passe
          </span>
          <input
            type="password"
            name="password"
            autoFocus
            className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 outline-none focus:border-(--color-brand)"
          />
        </label>
        {state?.error && <p className="mt-3 text-sm font-medium text-red-600">{state.error}</p>}
        <Button loading={pending} className="mt-5 h-11 w-full text-[15px] font-semibold">Entrer</Button>
      </form>
    </main>
  );
}
