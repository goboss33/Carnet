import { prisma, currentTenant } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { saveSettings } from "@/app/actions";
import Shell from "@/app/components/Shell";
import AutomationsSection from "./AutomationsSection";
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

        {/* Objectifs (Cap) */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-stone-600">Objectifs (Cap)</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className={label}>CA mensuel (CHF)</span>
              <input name="goalCaMensuel" type="number" min="0" defaultValue={raw?.goalCaMensuel ?? ""} placeholder={String(eff.goalCaMensuel)} className={input} />
            </label>
            <label className="block">
              <span className={label}>Panier moyen (CHF)</span>
              <input name="goalPanierMoyen" type="number" min="0" defaultValue={raw?.goalPanierMoyen ?? ""} placeholder={String(eff.goalPanierMoyen)} className={input} />
            </label>
            <label className="block">
              <span className={label}>Avis Google</span>
              <input name="goalAvisGoogle" type="number" min="0" defaultValue={raw?.goalAvisGoogle ?? ""} placeholder={String(eff.goalAvisGoogle)} className={input} />
            </label>
            <label className="block">
              <span className={label}>Part mariage (% du CA)</span>
              <input name="goalPartMariage" type="number" min="0" max="100" defaultValue={raw?.goalPartMariage ?? ""} placeholder={String(eff.goalPartMariage)} className={input} />
            </label>
            <label className="block">
              <span className={label}>CA hors sur-mesure (%)</span>
              <input name="goalPartDecouple" type="number" min="0" max="100" defaultValue={raw?.goalPartDecouple ?? ""} placeholder={String(eff.goalPartDecouple)} className={input} />
            </label>
            <label className="block">
              <span className={label}>Abonnés Instagram</span>
              <input name="goalInstagram" type="number" min="0" defaultValue={raw?.goalInstagram ?? ""} placeholder={String(eff.goalInstagram)} className={input} />
            </label>
          </div>
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

        {/* Automatismes (bot + crons) */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-stone-600">Automatismes</h2>
          <p className="mb-4 text-xs text-stone-500">
            Tout ce que le bot fait pour toi, au fil de la vie d'une commande. Active, règle les délais, teste.
          </p>
          <AutomationsSection
            toggles={{
              cronDigest: eff.cronDigest,
              cronEveningNudges: eff.cronEveningNudges,
              cronReviews: eff.cronReviews,
              cronBirthday: eff.cronBirthday,
              cronMonthly: eff.cronMonthly,
              cronFieldNudges: eff.cronFieldNudges,
            }}
            raw={{
              digestHour: raw?.digestHour ?? null,
              nudgeHour: raw?.nudgeHour ?? null,
              reviewDelayDays: raw?.reviewDelayDays ?? null,
              quoteFollowupDays: raw?.quoteFollowupDays ?? null,
              leadFollowupHours: raw?.leadFollowupHours ?? null,
              birthdayLeadDays: raw?.birthdayLeadDays ?? null,
              nudgeCooldownDays: raw?.nudgeCooldownDays ?? null,
              nudgeMaxPerEvening: raw?.nudgeMaxPerEvening ?? null,
              fieldFollowupDays: raw?.fieldFollowupDays ?? null,
            }}
            eff={{
              digestHour: eff.digestHour,
              nudgeHour: eff.nudgeHour,
              reviewDelayDays: eff.reviewDelayDays,
              quoteFollowupDays: eff.quoteFollowupDays,
              leadFollowupHours: eff.leadFollowupHours,
              birthdayLeadDays: eff.birthdayLeadDays,
              nudgeCooldownDays: eff.nudgeCooldownDays,
              nudgeMaxPerEvening: eff.nudgeMaxPerEvening,
              fieldFollowupDays: eff.fieldFollowupDays,
            }}
          />
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

    </Shell>
  );
}
