import { prisma, currentTenant } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { saveSettings } from "@/app/actions";
import Shell from "@/app/components/Shell";
import TestCronButton from "./TestCronButton";
import ConsignesField from "./ConsignesField";

export const dynamic = "force-dynamic";

const input = "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-600";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-stone-500";

export default async function Reglages() {
  const tenant = await currentTenant();
  const [raw, eff] = await Promise.all([
    prisma.settings.findUnique({ where: { tenantId: tenant.id } }),
    getSettings(tenant.id),
  ]);

  const crons: { name: string; label: string; on: boolean }[] = [
    { name: "cronDigest", label: "Digest du matin (programme du jour)", on: eff.cronDigest },
    { name: "cronEveningNudges", label: "Relances du soir (leads, devis, livraisons)", on: eff.cronEveningNudges },
    { name: "cronReviews", label: "Demandes d'avis (J+2 après livraison)", on: eff.cronReviews },
    { name: "cronBirthday", label: "Relance anniversaire (~3 semaines avant)", on: eff.cronBirthday },
  ];

  return (
    <Shell>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Réglages</h1>
      <p className="mb-6 max-w-2xl text-sm text-stone-500">
        Un champ laissé vide utilise la valeur par défaut (variable d'environnement ou réglage usine).
      </p>

      <form action={saveSettings} className="max-w-2xl space-y-6">
        {/* Compta */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-stone-600">Compta</h2>
          <label className="block max-w-xs">
            <span className={label}>Forfait déplacement (CHF/km)</span>
            <input name="kmRate" type="number" step="0.05" min="0" defaultValue={raw?.kmRate ?? ""} placeholder={String(eff.kmRate)} className={input} />
            <span className="mt-1 block text-[11px] text-stone-400">Aller-retour compté ×2. À confirmer avec ta fiduciaire.</span>
          </label>
        </section>

        {/* Paiement */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-stone-600">Paiement</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className={label}>Acompte par défaut (%)</span>
              <input name="depositPct" type="number" min="0" max="100" defaultValue={raw?.depositPct ?? ""} placeholder={String(eff.depositPct)} className={input} />
            </label>
            <label>
              <span className={label}>Moyen de paiement par défaut</span>
              <select name="paymentDefault" defaultValue={eff.paymentDefault} className={input}>
                <option value="twint">Twint</option>
                <option value="virement">Virement</option>
              </select>
            </label>
            <label>
              <span className={label}>Numéro Twint</span>
              <input name="twintNumber" defaultValue={raw?.twintNumber ?? ""} placeholder="+41 77 440 18 29" className={input} />
            </label>
            <label>
              <span className={label}>Titulaire du compte</span>
              <input name="accountHolder" defaultValue={raw?.accountHolder ?? ""} placeholder="Annie …" className={input} />
            </label>
            <label>
              <span className={label}>IBAN</span>
              <input name="iban" defaultValue={raw?.iban ?? ""} placeholder="CH.. …." className={input} />
            </label>
            <label>
              <span className={label}>Banque</span>
              <input name="bankName" defaultValue={raw?.bankName ?? ""} placeholder="Nom de la banque" className={input} />
            </label>
          </div>
        </section>

        {/* Assistant IA */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-stone-600">Assistant IA</h2>
          <label className="mb-4 flex items-center gap-3 text-sm text-stone-700">
            <input type="checkbox" name="assistantActive" defaultChecked={eff.assistantActive} className="h-4 w-4 accent-stone-900" />
            Assistant actif (rédaction des messages par IA)
          </label>
          <label className="mb-4 block">
            <span className={label}>Signature</span>
            <input name="assistantSignature" defaultValue={raw?.assistantSignature ?? ""} placeholder="À très vite, Annie — Maman Gâteau" className={input} />
          </label>
          <ConsignesField defaultValue={raw?.assistantInstructions ?? ""} />
        </section>

        {/* Bot & crons */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-stone-600">Bot Telegram</h2>
          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <label>
              <span className={label}>Heure du digest matin (0-23)</span>
              <input name="digestHour" type="number" min="0" max="23" defaultValue={raw?.digestHour ?? ""} placeholder={String(eff.digestHour)} className={input} />
            </label>
            <label>
              <span className={label}>Heure des relances du soir (0-23)</span>
              <input name="nudgeHour" type="number" min="0" max="23" defaultValue={raw?.nudgeHour ?? ""} placeholder={String(eff.nudgeHour)} className={input} />
            </label>
          </div>
          <p className={label}>Crons actifs</p>
          <div className="space-y-2.5">
            {crons.map((c) => (
              <label key={c.name} className="flex items-center gap-3 text-sm text-stone-700">
                <input type="checkbox" name={c.name} defaultChecked={c.on} className="h-4 w-4 accent-stone-900" />
                {c.label}
              </label>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-stone-400">
            Le token du bot et la liste des utilisateurs autorisés restent des variables d'environnement (sécurité).
          </p>
        </section>

        {/* Avis */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-stone-600">Avis clients</h2>
          <label>
            <span className={label}>Lien d'avis Google (mis dans les messages de demande d'avis)</span>
            <input name="reviewUrl" type="url" defaultValue={raw?.reviewUrl ?? ""} placeholder={eff.reviewUrl || "https://g.page/r/…"} className={input} />
          </label>
        </section>

        <button className="rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">
          Enregistrer les réglages
        </button>
      </form>

      <div className="mt-6 max-w-2xl">
        <TestCronButton />
      </div>
    </Shell>
  );
}
